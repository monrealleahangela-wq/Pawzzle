const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const uri = process.env.PRODUCT_REVIEW_TRANSACTION_TEST_URI;
const allowed = uri && /^mongodb:\/\/127\.0\.0\.1:\d+\/pawzzle_product_reviews_[a-z0-9_]+\?/.test(uri);

if (!allowed) {
  test('product-order review transaction integration (requires isolated localhost replica set)', { skip: true }, () => {});
} else {
  process.env.NODE_ENV = 'test';
  const Order = require('../models/Order');
  const Product = require('../models/Product');
  const Review = require('../models/Review');
  const Store = require('../models/Store');
  const {
    ProductReviewError,
    createProductOrderReview,
    resolveProductOrderReviewEligibility,
    decorateOrdersWithProductReviewStatus
  } = require('../services/productOrderReviewService');

  const ids = {};
  const newId = () => new mongoose.Types.ObjectId();
  const rawOrder = ({ customer, store, products, status = 'delivered' }) => ({
    _id: newId(),
    orderNumber: `SYN-${newId()}`,
    customer,
    addedBy: customer,
    store,
    items: products.map(product => ({
      _id: newId(), itemType: 'product', itemId: product._id,
      name: product.name, price: 100, quantity: 1
    })),
    totalAmount: products.length * 100,
    deliveryMethod: 'delivery',
    phoneNumber: '09000000000',
    paymentMethod: 'paymongo',
    status,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  test.before(async () => {
    await mongoose.connect(uri, { autoIndex: false });
    assert.equal(mongoose.connection.host, '127.0.0.1');
    assert.match(mongoose.connection.name, /^pawzzle_product_reviews_/);
    await mongoose.connection.dropDatabase();
    await Promise.all([Review.createIndexes(), Order.createIndexes(), Product.createIndexes(), Store.createIndexes()]);

    ids.owner = newId();
    ids.customer = newId();
    ids.otherCustomer = newId();
    ids.store = newId();
    ids.otherStore = newId();
    ids.productA = { _id: newId(), name: 'Synthetic Food' };
    ids.productB = { _id: newId(), name: 'Synthetic Toy' };
    await Store.collection.insertMany([
      { _id: ids.store, owner: ids.owner, name: 'Synthetic Store', slug: `synthetic-${ids.store}`, description: 'Test only', businessType: 'pet_store' },
      { _id: ids.otherStore, owner: newId(), name: 'Other Store', slug: `other-${ids.otherStore}`, description: 'Test only', businessType: 'pet_store' }
    ]);
    await Product.collection.insertMany([
      { ...ids.productA, sku: `SYN-${ids.productA._id}`, store: ids.store, addedBy: ids.owner, ratings: { average: 0, count: 0 } },
      { ...ids.productB, sku: `SYN-${ids.productB._id}`, store: ids.store, addedBy: ids.owner, ratings: { average: 0, count: 0 } }
    ]);
  });

  test.after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  test('multiple products and a store review remain independently reviewable', async () => {
    const order = rawOrder({ customer: ids.customer, store: ids.store, products: [ids.productA, ids.productB] });
    await Order.collection.insertOne(order);
    await Review.create({
      user: ids.customer, targetType: 'Store', targetId: ids.store, storeId: ids.store,
      rating: 5, comment: 'Store review remains separate.'
    });

    const first = await createProductOrderReview({
      userId: ids.customer, orderId: order._id, orderItemId: order.items[0]._id,
      productId: ids.productA._id, rating: 4, comment: 'Good food',
      images: ['https://images.test/product-a.jpg'], isAnonymous: true
    });
    const second = await createProductOrderReview({
      userId: ids.customer, orderId: order._id, orderItemId: order.items[1]._id,
      productId: ids.productB._id, rating: 5, comment: 'Good toy'
    });
    assert.notEqual(String(first._id), String(second._id));
    assert.equal(first.isAnonymous, true);
    assert.deepEqual(first.images, ['https://images.test/product-a.jpg']);
    const persisted = await Order.findById(order._id).lean();
    assert.equal(persisted.items[0].reviewStatus.isRated, true);
    assert.equal(persisted.items[1].reviewStatus.isRated, true);
    assert.notEqual(persisted.reviewStatus?.isRated, true);
  });

  test('exact concurrent duplicates produce exactly one persisted review', async () => {
    const order = rawOrder({ customer: ids.customer, store: ids.store, products: [ids.productA] });
    await Order.collection.insertOne(order);
    const submit = () => createProductOrderReview({
      userId: ids.customer, orderId: order._id, orderItemId: order.items[0]._id,
      productId: ids.productA._id, rating: 5, comment: 'Concurrent review'
    });
    const results = await Promise.allSettled([submit(), submit()]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const failure = results.find(result => result.status === 'rejected')?.reason;
    assert.equal(failure instanceof ProductReviewError, true);
    assert.equal(failure.statusCode, 409);
    assert.equal(await Review.countDocuments({ user: ids.customer, orderId: order._id, orderItemId: order.items[0]._id }), 1);
  });

  test('a later purchase of the same product has a separate review entitlement', async () => {
    const order = rawOrder({ customer: ids.customer, store: ids.store, products: [ids.productB] });
    await Order.collection.insertOne(order);
    const eligibility = await resolveProductOrderReviewEligibility({
      userId: ids.customer, orderId: order._id, orderItemId: order.items[0]._id, productId: ids.productB._id
    });
    assert.equal(eligibility.isEligible, true);
    await createProductOrderReview({
      userId: ids.customer, orderId: order._id, orderItemId: order.items[0]._id,
      productId: ids.productB._id, rating: 3, comment: 'Second purchase review'
    });
    assert.equal(await Review.countDocuments({ user: ids.customer, targetType: 'Product', targetId: ids.productB._id }), 2);
  });

  test('forged and cross-customer purchase contexts are denied', async () => {
    const order = rawOrder({ customer: ids.customer, store: ids.store, products: [ids.productA] });
    await Order.collection.insertOne(order);
    assert.equal((await resolveProductOrderReviewEligibility({
      userId: ids.otherCustomer, orderId: order._id, orderItemId: order.items[0]._id, productId: ids.productA._id
    })).reason, 'order_not_owned');
    assert.equal((await resolveProductOrderReviewEligibility({
      userId: ids.customer, orderId: order._id, orderItemId: newId(), productId: ids.productA._id
    })).reason, 'order_item_not_found');
    assert.equal((await resolveProductOrderReviewEligibility({
      userId: ids.customer, orderId: order._id, orderItemId: order.items[0]._id, productId: ids.productB._id
    })).reason, 'order_item_not_found');
  });

  test('legacy reviews are preserved and only reliably mapped purchase records block', async () => {
    const mappedOrder = rawOrder({ customer: ids.otherCustomer, store: ids.store, products: [ids.productA] });
    const separateOrder = rawOrder({ customer: ids.otherCustomer, store: ids.store, products: [ids.productA] });
    await Order.collection.insertMany([mappedOrder, separateOrder]);
    await Review.collection.insertMany([
      {
        _id: newId(), user: ids.otherCustomer, targetType: 'Product', targetId: ids.productA._id,
        storeId: ids.store, orderId: mappedOrder._id, rating: 4, comment: 'Legacy mapped', createdAt: new Date()
      },
      {
        _id: newId(), user: ids.otherCustomer, targetType: 'Product', targetId: ids.productB._id,
        storeId: ids.store, rating: 4, comment: 'Legacy unbound', createdAt: new Date()
      }
    ]);
    assert.equal((await resolveProductOrderReviewEligibility({
      userId: ids.otherCustomer, orderId: mappedOrder._id,
      orderItemId: mappedOrder.items[0]._id, productId: ids.productA._id
    })).reason, 'already_reviewed');
    assert.equal((await resolveProductOrderReviewEligibility({
      userId: ids.otherCustomer, orderId: separateOrder._id,
      orderItemId: separateOrder.items[0]._id, productId: ids.productA._id
    })).isEligible, true);

    const [decorated] = await decorateOrdersWithProductReviewStatus([mappedOrder], ids.otherCustomer);
    assert.equal(decorated.items[0].reviewStatus.isRated, true);
  });
}
