const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Delivery = require('../models/Delivery');
const User = require('../models/User');
const Store = require('../models/Store');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const Pet = require('../models/Pet');
const Voucher = require('../models/Voucher');
const Review = require('../models/Review');
const { getMyRiderDetails } = require('../controllers/staffController');
const {
  cancelOrderDelivery,
  completePickupOrder
} = require('../services/deliveryAssignmentService');

const transactionTestUri = process.env.MONGODB_TRANSACTION_TEST_URI;
const isolatedTransactionTestUri = transactionTestUri ? (() => {
  const uri = new URL(transactionTestUri);
  const baseDatabase = uri.pathname.replace(/^\//, '') || 'pawzzle_transaction_test';
  uri.pathname = `/${baseDatabase}_delivery_order_integrity_${process.pid}`;
  return uri.toString();
})() : null;

const id = () => new mongoose.Types.ObjectId();
const now = () => new Date();

test('real MongoDB makes cancellation resources and pickup payout exactly once', {
  skip: !transactionTestUri
}, async t => {
  await mongoose.connect(isolatedTransactionTestUri, { autoIndex: false });
  await mongoose.connection.dropDatabase();
  await Promise.all([
    Order.init(), Delivery.init(), User.init(), Store.init(), Product.init(),
    Inventory.init(), Pet.init(), Voucher.init(), Review.init()
  ]);

  t.after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  const owner = id();
  const customer = id();
  const rider = id();
  const store = id();
  await Store.collection.insertOne({
    _id: store, owner, name: 'Transaction Store', balance: 0,
    stats: { totalRevenue: 0, totalPlatformFees: 0 }, createdAt: now(), updatedAt: now()
  });
  await User.collection.insertOne({
    _id: rider, username: `rider-${rider}`, email: `${rider}@example.test`, password: 'test-only',
    firstName: 'Transaction', lastName: 'Rider', role: 'delivery_rider', store,
    isActive: true, isDeleted: false, staffStatus: 'active',
    riderProfile: {
      accountStatus: 'active',
      vehicleCapacity: { maxWeightKg: 10, maxParcelCount: 10 },
      currentLoad: { weightKg: 2, parcelCount: 2 }
    },
    createdAt: now(), updatedAt: now()
  });

  const product = id();
  const pet = id();
  const voucher = id();
  const cancellableOrder = id();
  await Product.collection.insertOne({
    _id: product, name: 'Committed Product', category: 'supplies', description: 'Fixture',
    shortDescription: 'Fixture', price: 10, stockQuantity: 5, sku: `SKU-${product}`,
    images: ['fixture.jpg'], addedBy: owner, store, isActive: true, isDeleted: false,
    createdAt: now(), updatedAt: now()
  });
  await Inventory.collection.insertOne({
    _id: id(), product, store, quantity: 5, reorderLevel: 1, maxStock: 100,
    isActive: true, createdAt: now(), updatedAt: now()
  });
  await Voucher.collection.insertOne({
    _id: voucher, code: `TX-${voucher}`, discountType: 'fixed', discountValue: 5,
    minPurchase: 0, startDate: new Date('2026-01-01'), endDate: new Date('2030-01-01'),
    usedCount: 1, isActive: true, store, createdAt: now(), updatedAt: now()
  });
  await Pet.collection.insertOne({
    _id: pet, name: 'Reserved Pet', species: 'dog', breed: 'Fixture', age: 1,
    gender: 'male', size: 'small', description: 'Fixture', price: 100,
    isAvailable: false, status: 'reserved', quantity: 1, approvalStatus: 'approved',
    reservation: { order: cancellableOrder, reservedAt: now() }, addedBy: owner, store,
    createdAt: now(), updatedAt: now()
  });
  await Order.collection.insertOne({
    _id: cancellableOrder, orderNumber: `ORD-${cancellableOrder}`, customer, addedBy: owner, store,
    items: [
      { itemType: 'product', itemId: product, name: 'Committed Product', price: 10, quantity: 2 },
      { itemType: 'pet', itemId: pet, name: 'Reserved Pet', price: 100, quantity: 1 }
    ],
    totalAmount: 120, voucher, deliveryMethod: 'delivery', phoneNumber: '09170000000',
    paymentMethod: 'paymongo', paymentStatus: 'pending', status: 'rider_assigned',
    payoutStatus: 'pending', fulfillmentTimeline: [], createdAt: now(), updatedAt: now()
  });
  await Delivery.collection.insertOne({
    _id: id(), store, order: cancellableOrder, status: 'assigned', isLive: true,
    assignmentType: 'internal', assignedRider: rider,
    trackingToken: 'customer-capability-must-not-leak',
    capacityReservation: { rider, weightKg: 2, parcelCount: 2, reservedAt: now() },
    statusHistory: [], assignmentHistory: [], createdAt: now(), updatedAt: now()
  });

  const reviewedDelivery = await Delivery.findOne({ order: cancellableOrder }).lean();
  await Review.collection.insertOne({
    _id: id(), user: customer, targetType: 'Delivery', targetId: reviewedDelivery._id,
    deliveryId: reviewedDelivery._id, staffId: rider, storeId: store, rating: 5,
    comment: 'Safe Rider feedback', isApproved: true, isDeleted: false,
    createdAt: now(), updatedAt: now()
  });
  const summaryResponse = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await getMyRiderDetails({ user: { _id: rider, role: 'delivery_rider' }, params: {} }, summaryResponse);
  assert.equal(summaryResponse.statusCode, 200);
  assert.equal(String(summaryResponse.body.recentFeedback[0].deliveryReference), String(reviewedDelivery._id));
  assert.match(summaryResponse.body.recentFeedback[0].comment, /Safe Rider feedback/);
  assert.doesNotMatch(JSON.stringify(summaryResponse.body), /customer-capability-must-not-leak/);
  assert.equal(summaryResponse.body.recentFeedback[0].trackingToken, undefined);

  const cancellations = await Promise.allSettled([
    cancelOrderDelivery({ orderId: cancellableOrder, actorId: customer }),
    cancelOrderDelivery({ orderId: cancellableOrder, actorId: customer })
  ]);
  assert.equal(cancellations.every(result => result.status === 'fulfilled'), true);
  assert.deepEqual(cancellations.map(result => result.value.changed).sort(), [false, true]);
  assert.equal((await Order.findById(cancellableOrder).lean()).status, 'cancelled');
  assert.equal((await Order.findById(cancellableOrder).lean()).fulfillmentTimeline.filter(row => row.status === 'cancelled').length, 1);
  assert.equal((await Delivery.findOne({ order: cancellableOrder }).lean()).status, 'cancelled');
  assert.deepEqual((await User.findById(rider).lean()).riderProfile.currentLoad, { weightKg: 0, parcelCount: 0 });
  assert.equal((await Inventory.findOne({ product, store }).lean()).quantity, 7);
  assert.equal((await Product.findById(product).lean()).stockQuantity, 7);
  assert.equal((await Voucher.findById(voucher).lean()).usedCount, 0);
  assert.equal((await Pet.findById(pet).lean()).status, 'available');

  const ineligibleVoucher = id();
  const ineligibleOrder = id();
  await Voucher.collection.insertOne({
    _id: ineligibleVoucher, code: `TX-${ineligibleVoucher}`, discountType: 'fixed', discountValue: 5,
    minPurchase: 0, startDate: new Date('2026-01-01'), endDate: new Date('2030-01-01'),
    usedCount: 1, isActive: true, store, createdAt: now(), updatedAt: now()
  });
  await Order.collection.insertOne({
    _id: ineligibleOrder, orderNumber: `ORD-${ineligibleOrder}`, customer, addedBy: owner, store,
    items: [{ itemType: 'product', itemId: product, name: 'Committed Product', price: 10, quantity: 1 }],
    totalAmount: 10, voucher: ineligibleVoucher, deliveryMethod: 'delivery', phoneNumber: '09170000000',
    paymentMethod: 'paymongo', paymentStatus: 'pending', status: 'picked_up', payoutStatus: 'pending',
    fulfillmentTimeline: [], createdAt: now(), updatedAt: now()
  });
  await Delivery.collection.insertOne({
    _id: id(), store, order: ineligibleOrder, status: 'picked_up', isLive: true,
    assignmentType: 'internal', assignedRider: rider,
    capacityReservation: { rider, weightKg: 1, parcelCount: 1, reservedAt: now() },
    statusHistory: [], assignmentHistory: [], createdAt: now(), updatedAt: now()
  });
  await assert.rejects(
    cancelOrderDelivery({ orderId: ineligibleOrder, actorId: customer }),
    /cannot be cancelled/
  );
  assert.equal((await Order.findById(ineligibleOrder).lean()).status, 'picked_up');
  assert.equal((await Inventory.findOne({ product, store }).lean()).quantity, 7);
  assert.equal((await Voucher.findById(ineligibleVoucher).lean()).usedCount, 1);

  const rollbackOrder = id();
  const missingInventoryProduct = id();
  await Product.collection.insertOne({
    _id: missingInventoryProduct, name: 'Missing Inventory', category: 'supplies', description: 'Fixture',
    shortDescription: 'Fixture', price: 10, stockQuantity: 1, sku: `SKU-${missingInventoryProduct}`,
    images: ['fixture.jpg'], addedBy: owner, store, isActive: true, isDeleted: false,
    createdAt: now(), updatedAt: now()
  });
  await Order.collection.insertOne({
    _id: rollbackOrder, orderNumber: `ORD-${rollbackOrder}`, customer, addedBy: owner, store,
    items: [{ itemType: 'product', itemId: missingInventoryProduct, name: 'Missing Inventory', price: 10, quantity: 1 }],
    totalAmount: 10, deliveryMethod: 'pickup', phoneNumber: '09170000000', paymentMethod: 'paymongo',
    paymentStatus: 'pending', status: 'ready_for_pickup', payoutStatus: 'pending',
    fulfillmentTimeline: [], createdAt: now(), updatedAt: now()
  });
  await assert.rejects(
    cancelOrderDelivery({ orderId: rollbackOrder, actorId: customer }),
    /Inventory record not found/
  );
  assert.equal((await Order.findById(rollbackOrder).lean()).status, 'ready_for_pickup');
  assert.equal((await Product.findById(missingInventoryProduct).lean()).stockQuantity, 1);

  const pickupPet = id();
  const pickupOrder = id();
  await Pet.collection.insertOne({
    _id: pickupPet, name: 'Pickup Pet', species: 'dog', breed: 'Fixture', age: 1,
    gender: 'female', size: 'small', description: 'Fixture', price: 100,
    isAvailable: false, status: 'reserved', quantity: 1, approvalStatus: 'approved',
    reservation: { order: pickupOrder, reservedAt: now() }, addedBy: owner, store,
    createdAt: now(), updatedAt: now()
  });
  await Order.collection.insertOne({
    _id: pickupOrder, orderNumber: `ORD-${pickupOrder}`, customer, addedBy: owner, store,
    items: [{ itemType: 'pet', itemId: pickupPet, name: 'Pickup Pet', price: 100, quantity: 1 }],
    totalAmount: 100, pricingBreakdown: { vatAmount: 0 }, deliveryMethod: 'pickup',
    phoneNumber: '09170000000', paymentMethod: 'paymongo', paymentStatus: 'paid',
    status: 'ready_for_pickup', payoutStatus: 'pending', isRevenueRecorded: false,
    fulfillmentTimeline: [], createdAt: now(), updatedAt: now()
  });

  const pickups = await Promise.allSettled([
    completePickupOrder({ orderId: pickupOrder, customerId: customer }),
    completePickupOrder({ orderId: pickupOrder, customerId: customer })
  ]);
  assert.equal(pickups.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(pickups.filter(result => result.status === 'rejected').length, 1);
  const completedOrder = await Order.findById(pickupOrder).lean();
  assert.equal(completedOrder.status, 'delivered');
  assert.equal(completedOrder.payoutStatus, 'released');
  assert.equal(completedOrder.isRevenueRecorded, true);
  assert.equal(completedOrder.fulfillmentTimeline.filter(row => row.status === 'delivered').length, 1);
  assert.equal((await Pet.findById(pickupPet).lean()).status, 'sold');
  const updatedStore = await Store.findById(store).lean();
  assert.equal(updatedStore.balance, 90);
  assert.equal(updatedStore.stats.totalRevenue, 100);
  assert.equal(updatedStore.stats.totalPlatformFees, 10);

  const rollbackPickupPet = id();
  const rollbackPickupOrder = id();
  const missingStore = id();
  await Pet.collection.insertOne({
    _id: rollbackPickupPet, name: 'Rollback Pickup Pet', species: 'dog', breed: 'Fixture', age: 1,
    gender: 'male', size: 'small', description: 'Fixture', price: 100,
    isAvailable: false, status: 'reserved', quantity: 1, approvalStatus: 'approved',
    reservation: { order: rollbackPickupOrder, reservedAt: now() }, addedBy: owner, store,
    createdAt: now(), updatedAt: now()
  });
  await Order.collection.insertOne({
    _id: rollbackPickupOrder, orderNumber: `ORD-${rollbackPickupOrder}`, customer, addedBy: owner,
    store: missingStore,
    items: [{ itemType: 'pet', itemId: rollbackPickupPet, name: 'Rollback Pickup Pet', price: 100, quantity: 1 }],
    totalAmount: 100, pricingBreakdown: { vatAmount: 0 }, deliveryMethod: 'pickup',
    phoneNumber: '09170000000', paymentMethod: 'paymongo', paymentStatus: 'paid',
    status: 'ready_for_pickup', payoutStatus: 'pending', isRevenueRecorded: false,
    fulfillmentTimeline: [], createdAt: now(), updatedAt: now()
  });
  await assert.rejects(
    completePickupOrder({ orderId: rollbackPickupOrder, customerId: customer }),
    /seller Store no longer exists/
  );
  const rolledBackPickup = await Order.findById(rollbackPickupOrder).lean();
  assert.equal(rolledBackPickup.status, 'ready_for_pickup');
  assert.equal(rolledBackPickup.payoutStatus, 'pending');
  assert.equal(rolledBackPickup.isRevenueRecorded, false);
  assert.equal((await Pet.findById(rollbackPickupPet).lean()).status, 'reserved');
});
