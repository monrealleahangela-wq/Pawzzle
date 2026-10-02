const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const ProcurementCart = require('../models/ProcurementCart');
const PurchaseOrder = require('../models/PurchaseOrder');
const ProcurementReceivingReport = require('../models/ProcurementReceivingReport');
const Supplier = require('../models/Supplier');
const SupplierProduct = require('../models/SupplierProduct');
const Pet = require('../models/Pet');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const InventoryLot = require('../models/InventoryLot');
const InventoryTransaction = require('../models/InventoryTransaction');
const Notification = require('../models/Notification');
const SupplyChainLog = require('../models/SupplyChainLog');
require('../models/User');
const {
  submitProcurementCart,
  cancelOrder,
  submitReceivingInspection,
  createPurchaseOrder
} = require('../controllers/purchaseOrderController');
const {
  addProduct,
  updateOrderStatus,
  updateProduct,
  deleteProduct
} = require('../controllers/supplierController');

const transactionTestUri = process.env.MONGODB_TRANSACTION_TEST_URI;
const isolatedTransactionTestUri = transactionTestUri ? (() => {
  const uri = new URL(transactionTestUri);
  const baseDatabase = uri.pathname.replace(/^\//, '') || 'pawzzle_transaction_test';
  uri.pathname = `/${baseDatabase}_state_integrity_${process.pid}`;
  return uri.toString();
})() : null;

const invoke = async (handler, req) => {
  const result = { status: 200 };
  const res = {
    headersSent: false,
    status(code) { result.status = code; return this; },
    json(body) { result.body = body; this.headersSent = true; return this; }
  };
  await handler(req, res);
  return result;
};

test('real MongoDB enforces procurement stock commitments, exact-pet cancellation, and supplier transitions', {
  skip: !transactionTestUri
}, async t => {
  await mongoose.connect(isolatedTransactionTestUri, { autoIndex: false });
  await mongoose.connection.dropDatabase();

  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const store = new mongoose.Types.ObjectId();
  const supplierId = new mongoose.Types.ObjectId();
  const supplierUser = new mongoose.Types.ObjectId();
  const otherSupplierId = new mongoose.Types.ObjectId();
  const otherSupplierUser = new mongoose.Types.ObjectId();
  const userA = new mongoose.Types.ObjectId();
  const userB = new mongoose.Types.ObjectId();
  const userC = new mongoose.Types.ObjectId();
  const productIds = [];
  const petIds = [];
  const storeProductIds = [];
  const orderIds = [];

  const cleanup = async () => {
    await Promise.all([
      ProcurementCart.deleteMany({ store }),
      ProcurementReceivingReport.deleteMany({ store }),
      PurchaseOrder.deleteMany({ store }),
      SupplierProduct.deleteMany({ supplier: { $in: [supplierId, otherSupplierId] } }),
      Pet.deleteMany({ _id: { $in: petIds } }),
      Product.deleteMany({ _id: { $in: storeProductIds } }),
      Inventory.deleteMany({ store }),
      InventoryLot.deleteMany({ store }),
      InventoryTransaction.deleteMany({ store }),
      Notification.deleteMany({ relatedId: { $in: orderIds } }),
      SupplyChainLog.deleteMany({ supplier: { $in: [supplierId, otherSupplierId] } }),
      Supplier.deleteMany({ _id: { $in: [supplierId, otherSupplierId] } })
    ]);
  };
  t.after(async () => {
    await cleanup();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  await Supplier.collection.insertMany([
    {
      _id: supplierId,
      user: supplierUser,
      businessName: `Integrity Supplier ${nonce}`,
      businessSlug: `integrity-supplier-${nonce}`,
      contactPerson: 'Integrity Supplier Contact',
      email: `integrity-${nonce}@example.test`,
      phone: '09170000001',
      address: { street: '1 Test Street', city: 'Test City', province: 'Test Province', country: 'PH' },
      supplierType: 'platform', status: 'verified', isActive: true, isDeleted: false,
      performance: { totalOrders: 0, completedOrders: 0, cancelledOrders: 0, averageDeliveryDays: 0, reliabilityScore: 100, totalRevenue: 0 },
      createdAt: new Date(), updatedAt: new Date()
    },
    {
      _id: otherSupplierId,
      user: otherSupplierUser,
      businessName: `Other Supplier ${nonce}`,
      businessSlug: `other-supplier-${nonce}`,
      contactPerson: 'Other Supplier Contact',
      email: `other-${nonce}@example.test`,
      phone: '09170000002',
      address: { street: '2 Test Street', city: 'Test City', province: 'Test Province', country: 'PH' },
      supplierType: 'platform', status: 'verified', isActive: true, isDeleted: false,
      performance: { totalOrders: 0, completedOrders: 0, cancelledOrders: 0, averageDeliveryDays: 0, reliabilityScore: 100, totalRevenue: 0 },
      createdAt: new Date(), updatedAt: new Date()
    }
  ]);

  const makeSupplierProduct = async (overrides = {}) => {
    const product = await SupplierProduct.create({
      supplier: supplierId,
      itemType: 'product',
      name: `Supply ${nonce}`,
      sku: `SUPPLY-${nonce}-${productIds.length}`,
      category: 'general_product',
      wholesalePrice: 10,
      availableStock: 5,
      minimumOrderQuantity: 1,
      isActive: true,
      isDeleted: false,
      ...overrides
    });
    productIds.push(product._id);
    return product;
  };
  const makeCart = async ({ user, supplierProduct, quantity, storeProduct = null }) => ProcurementCart.create({
    user,
    store,
    items: [{
      supplierProduct: supplierProduct._id,
      supplier: supplierProduct.supplier,
      itemType: supplierProduct.itemType,
      quantity,
      storeProduct,
      addedUnitPrice: supplierProduct.wholesalePrice
    }]
  });
  const submit = user => invoke(submitProcurementCart, {
    body: { paymentTiming: 'after_inspection', paymentMethod: 'paymongo' },
    params: {}, query: {},
    user: { _id: user, role: 'procurement_staff', store }
  });
  const livePetCatalogPayload = suffix => ({
    itemType: 'live_pet',
    name: `Catalog Pet ${suffix}`,
    sku: `LIVE-CATALOG-${nonce}-${suffix}`,
    description: 'Exact supplier catalog pet',
    category: 'live_pets',
    wholesalePrice: 2500,
    retailPrice: 3000,
    availableStock: 1,
    minimumOrderQuantity: 1,
    unitOfMeasure: 'piece',
    images: [],
    pet: {
      name: `Catalog Pet ${suffix}`,
      species: 'dog',
      breed: 'Mixed',
      age: 1,
      ageUnit: 'years',
      gender: 'male',
      size: 'medium',
      description: 'Exact supplier catalog pet'
    }
  });
  const addCatalogProduct = body => invoke(addProduct, {
    body, params: {}, query: {},
    user: { _id: supplierUser, role: 'supplier' }
  });

  await t.test('live-pet catalog creation commits Pet, SupplierProduct, and supplier metadata together', async () => {
    const body = livePetCatalogPayload('success');
    const created = await addCatalogProduct(body);
    assert.equal(created.status, 201);

    const product = await SupplierProduct.findOne({ supplier: supplierId, sku: body.sku });
    const pet = await Pet.findById(product.pet);
    const supplier = await Supplier.findById(supplierId);
    productIds.push(product._id);
    petIds.push(pet._id);

    assert.equal(product.itemType, 'live_pet');
    assert.equal(product.availableStock, 1);
    assert.equal(product.minimumOrderQuantity, 1);
    assert.equal(product.unitOfMeasure, 'piece');
    assert.equal(String(product.pet), String(pet._id));
    assert.equal(String(pet.sourceSupplier), String(supplierId));
    assert.equal(pet.quantity, 1);
    assert.equal(pet.status, 'available');
    assert.equal(pet.isAvailable, true);
    assert.equal(pet.listingContext, 'supplier_catalog');
    assert.equal(pet.approvalStatus, 'pending');
    assert.equal(pet.procurementReservation?.purchaseOrder, undefined);
    assert.ok(supplier.goodsTypes.includes('live_pets'));
    assert.equal(await SupplyChainLog.countDocuments({
      supplier: supplierId,
      action: 'supplier_product_added',
      'relatedEntity.id': product._id
    }), 1);
  });

  await t.test('live-pet catalog creation rolls back an earlier Pet when SupplierProduct creation fails', async () => {
    const body = livePetCatalogPayload('product-failure');
    const originalSave = SupplierProduct.prototype.save;
    SupplierProduct.prototype.save = async function failTargetProduct(options) {
      if (this.sku === body.sku) throw new Error('forced SupplierProduct failure');
      return originalSave.call(this, options);
    };
    let result;
    try {
      result = await addCatalogProduct(body);
    } finally {
      SupplierProduct.prototype.save = originalSave;
    }

    assert.equal(result.status, 500);
    assert.equal(await SupplierProduct.countDocuments({ supplier: supplierId, sku: body.sku }), 0);
    assert.equal(await Pet.countDocuments({ sourceSupplier: supplierId, name: body.pet.name }), 0);
  });

  await t.test('live-pet catalog creation rolls back Pet and product when supplier metadata fails', async () => {
    const body = livePetCatalogPayload('supplier-failure');
    const originalUpdateOne = Supplier.updateOne;
    Supplier.updateOne = async function failTargetSupplier(filter, update, options) {
      if (String(filter?._id) === String(supplierId) && update?.$addToSet?.goodsTypes === 'live_pets') {
        throw new Error('forced Supplier metadata failure');
      }
      return originalUpdateOne.call(this, filter, update, options);
    };
    let result;
    try {
      result = await addCatalogProduct(body);
    } finally {
      Supplier.updateOne = originalUpdateOne;
    }

    assert.equal(result.status, 500);
    assert.equal(await SupplierProduct.countDocuments({ supplier: supplierId, sku: body.sku }), 0);
    assert.equal(await Pet.countDocuments({ sourceSupplier: supplierId, name: body.pet.name }), 0);
  });

  await t.test('catalog add, update, and delete remain successful when secondary audit logging fails', async () => {
    const body = {
      itemType: 'product',
      name: `Audit-resilient supply ${nonce}`,
      sku: `AUDIT-RESILIENT-${nonce}`,
      description: 'Catalog mutation secondary-effect test',
      category: 'general_product',
      wholesalePrice: 25,
      availableStock: 4,
      minimumOrderQuantity: 1,
      unitOfMeasure: 'piece'
    };
    const originalCreate = SupplyChainLog.create;
    SupplyChainLog.create = async () => { throw new Error('forced catalog audit outage'); };
    let added;
    let updated;
    let removed;
    try {
      added = await addCatalogProduct(body);
      const product = await SupplierProduct.findOne({ supplier: supplierId, sku: body.sku });
      productIds.push(product._id);
      updated = await invoke(updateProduct, {
        params: { id: product._id }, body: { wholesalePrice: 30 }, query: {},
        user: { _id: supplierUser, role: 'supplier' }
      });
      removed = await invoke(deleteProduct, {
        params: { id: product._id }, body: {}, query: {},
        user: { _id: supplierUser, role: 'supplier' }
      });
    } finally {
      SupplyChainLog.create = originalCreate;
    }

    assert.equal(added.status, 201);
    assert.equal(updated.status, 200);
    assert.equal(removed.status, 200);
    const product = await SupplierProduct.findOne({ supplier: supplierId, sku: body.sku });
    assert.equal(product.wholesalePrice, 30);
    assert.equal(product.isDeleted, true);
    assert.equal(product.isActive, false);
  });

  await t.test('concurrent carts cannot oversubscribe stock, retries do not consume more, and cancellation releases once', async () => {
    const supplierProduct = await makeSupplierProduct();
    await Promise.all([
      makeCart({ user: userA, supplierProduct, quantity: 4 }),
      makeCart({ user: userB, supplierProduct, quantity: 4 })
    ]);

    const results = await Promise.all([submit(userA), submit(userB)]);
    assert.deepEqual(results.map(row => row.status).sort(), [201, 409]);
    const order = await PurchaseOrder.findOne({ store, 'items.supplierProduct': supplierProduct._id });
    orderIds.push(order._id);
    assert.equal((await SupplierProduct.findById(supplierProduct._id)).availableStock, 1);
    assert.equal(await PurchaseOrder.countDocuments({ store, 'items.supplierProduct': supplierProduct._id }), 1);
    assert.equal(order.items[0].supplierStockCommittedQuantity, 4);

    const failedUser = results[0].status === 409 ? userA : userB;
    const winner = results[0].status === 201 ? userA : userB;
    assert.equal((await ProcurementCart.findOne({ user: failedUser, store })).items.length, 1);
    assert.equal((await ProcurementCart.findOne({ user: winner, store })).items.length, 0);
    assert.equal((await submit(failedUser)).status, 409);
    assert.equal((await SupplierProduct.findById(supplierProduct._id)).availableStock, 1);

    const cancellation = await invoke(cancelOrder, {
      params: { id: order._id }, body: { reason: 'No longer required' }, query: {},
      user: { _id: winner, role: 'procurement_staff', store }
    });
    assert.equal(cancellation.status, 200);
    assert.equal((await SupplierProduct.findById(supplierProduct._id)).availableStock, 5);
    const cancelled = await PurchaseOrder.findById(order._id);
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.items[0].supplierStockCommitmentReleased, true);
    assert.equal((await invoke(cancelOrder, {
      params: { id: order._id }, body: { reason: 'Retry' }, query: {},
      user: { _id: winner, role: 'procurement_staff', store }
    })).status, 409);
    assert.equal((await SupplierProduct.findById(supplierProduct._id)).availableStock, 5);
  });

  await t.test('ordinary catalog edits preserve active commitments and deletion cannot make them unreleasable', async () => {
    const supplierProduct = await makeSupplierProduct({ sku: `CATALOG-COMMIT-${nonce}` });
    const user = new mongoose.Types.ObjectId();
    await makeCart({ user, supplierProduct, quantity: 3 });
    const submitted = await submit(user);
    assert.equal(submitted.status, 201);
    const order = await PurchaseOrder.findById(submitted.body.orders[0]._id);
    orderIds.push(order._id);
    assert.equal((await SupplierProduct.findById(supplierProduct._id)).availableStock, 2);

    const updated = await invoke(updateProduct, {
      params: { id: supplierProduct._id }, body: { availableStock: 7 }, query: {},
      user: { _id: supplierUser, role: 'supplier' }
    });
    assert.equal(updated.status, 200);
    assert.equal((await SupplierProduct.findById(supplierProduct._id)).availableStock, 7);

    const blockedDelete = await invoke(deleteProduct, {
      params: { id: supplierProduct._id }, body: {}, query: {},
      user: { _id: supplierUser, role: 'supplier' }
    });
    assert.equal(blockedDelete.status, 409);
    assert.equal((await SupplierProduct.findById(supplierProduct._id)).isDeleted, false);

    const cancellation = await invoke(cancelOrder, {
      params: { id: order._id }, body: { reason: 'Release after catalog replenishment' }, query: {},
      user: { _id: user, role: 'procurement_staff', store }
    });
    assert.equal(cancellation.status, 200);
    assert.equal((await SupplierProduct.findById(supplierProduct._id)).availableStock, 10);
    assert.equal((await PurchaseOrder.findById(order._id)).items[0].supplierStockCommitmentReleased, true);

    const deletedAfterRelease = await invoke(deleteProduct, {
      params: { id: supplierProduct._id }, body: {}, query: {},
      user: { _id: supplierUser, role: 'supplier' }
    });
    assert.equal(deletedAfterRelease.status, 200);
    assert.equal((await SupplierProduct.findById(supplierProduct._id)).isDeleted, true);
  });

  await t.test('concurrent catalog deletion and cancellation cannot strand an ordinary commitment', async () => {
    const supplierProduct = await makeSupplierProduct({ sku: `CATALOG-RACE-${nonce}` });
    const user = new mongoose.Types.ObjectId();
    await makeCart({ user, supplierProduct, quantity: 2 });
    const submitted = await submit(user);
    const order = await PurchaseOrder.findById(submitted.body.orders[0]._id);
    orderIds.push(order._id);

    const [deletion, cancellation] = await Promise.all([
      invoke(deleteProduct, {
        params: { id: supplierProduct._id }, body: {}, query: {},
        user: { _id: supplierUser, role: 'supplier' }
      }),
      invoke(cancelOrder, {
        params: { id: order._id }, body: { reason: 'Concurrent catalog mutation' }, query: {},
        user: { _id: user, role: 'procurement_staff', store }
      })
    ]);

    assert.equal(cancellation.status, 200);
    assert.ok([200, 409].includes(deletion.status));
    const [currentOrder, currentProduct] = await Promise.all([
      PurchaseOrder.findById(order._id),
      SupplierProduct.findById(supplierProduct._id)
    ]);
    assert.equal(currentOrder.status, 'cancelled');
    assert.equal(currentOrder.items[0].supplierStockCommitmentReleased, true);
    assert.equal(currentProduct.availableStock, 5);
  });

  await t.test('legacy soft-deleted catalog rows remain releasable by their authoritative PO commitment', async () => {
    const supplierProduct = await makeSupplierProduct({ sku: `LEGACY-TOMBSTONE-${nonce}` });
    const user = new mongoose.Types.ObjectId();
    await makeCart({ user, supplierProduct, quantity: 2 });
    const submitted = await submit(user);
    const order = await PurchaseOrder.findById(submitted.body.orders[0]._id);
    orderIds.push(order._id);
    await SupplierProduct.updateOne({ _id: supplierProduct._id }, {
      $set: { isDeleted: true, isActive: false }
    });

    const cancellation = await invoke(cancelOrder, {
      params: { id: order._id }, body: { reason: 'Release historical soft-deleted commitment' }, query: {},
      user: { _id: user, role: 'procurement_staff', store }
    });
    assert.equal(cancellation.status, 200);
    const [currentOrder, tombstone] = await Promise.all([
      PurchaseOrder.findById(order._id),
      SupplierProduct.findById(supplierProduct._id)
    ]);
    assert.equal(currentOrder.status, 'cancelled');
    assert.equal(currentOrder.items[0].supplierStockCommitmentReleased, true);
    assert.equal(tombstone.isDeleted, true);
    assert.equal(tombstone.availableStock, 5);
  });

  await t.test('partial receiving uses committed stock without a second supplier decrement', async () => {
    const storeProduct = new mongoose.Types.ObjectId();
    storeProductIds.push(storeProduct);
    await Product.collection.insertOne({
      _id: storeProduct, store, name: `Store Supply ${nonce}`, sku: `STORE-${nonce}`,
      stockQuantity: 0, stockStatus: 'out_of_stock', isDeleted: false,
      createdAt: new Date(), updatedAt: new Date()
    });
    const supplierProduct = await makeSupplierProduct({ sku: `RECEIVE-${nonce}` });
    await makeCart({ user: userC, supplierProduct, quantity: 3, storeProduct });
    const submitted = await submit(userC);
    assert.equal(submitted.status, 201);
    const order = await PurchaseOrder.findById(submitted.body.orders[0]._id);
    orderIds.push(order._id);
    assert.equal((await SupplierProduct.findById(supplierProduct._id)).availableStock, 2);
    order.status = 'delivered';
    order.inspectionStatus = 'awaiting_inspection';
    await order.save();

    const inspected = await invoke(submitReceivingInspection, {
      params: { id: order._id },
      body: { items: JSON.stringify([{
        purchaseOrderItem: order.items[0]._id,
        receivedQuantity: 3,
        damagedQuantity: 1,
        incorrectQuantity: 0
      }]) },
      files: [], query: {},
      user: { _id: userC, role: 'platform_admin' }
    });
    assert.equal(inspected.status, 201);
    assert.equal((await SupplierProduct.findById(supplierProduct._id)).availableStock, 2);
    assert.equal((await PurchaseOrder.findById(order._id)).items[0].receivedQuantity, 2);
    assert.equal((await Inventory.findOne({ store, product: storeProduct })).quantity, 2);
  });

  const makeLivePetProduct = async suffix => {
    const pet = await Pet.create({
      name: `Exact Pet ${suffix}`,
      species: 'dog', breed: 'Mixed', age: 1, ageUnit: 'years', gender: 'male', size: 'small',
      description: 'Exact procurement pet fixture', price: 1000,
      status: 'available', isAvailable: true, listingContext: 'supplier_catalog',
      sourceSupplier: supplierId, addedBy: supplierUser, approvalStatus: 'pending'
    });
    petIds.push(pet._id);
    const product = await makeSupplierProduct({
      itemType: 'live_pet', pet: pet._id, name: pet.name,
      sku: `PET-${nonce}-${suffix}`, category: 'live_pets', availableStock: 1,
      minimumOrderQuantity: 1
    });
    return { pet, product };
  };

  await t.test('cancellation releases only the exact pet and is retry safe', async () => {
    const first = await makeLivePetProduct('first');
    const untouched = await makeLivePetProduct('untouched');
    const user = new mongoose.Types.ObjectId();
    await makeCart({ user, supplierProduct: first.product, quantity: 1 });
    const submitted = await submit(user);
    assert.equal(submitted.status, 201);
    const order = await PurchaseOrder.findById(submitted.body.orders[0]._id);
    orderIds.push(order._id);
    assert.equal((await Pet.findById(first.pet._id)).status, 'reserved');
    assert.equal(String((await Pet.findById(first.pet._id)).procurementReservation.purchaseOrder), String(order._id));

    const cancellationRequest = reason => ({
      params: { id: order._id }, body: { reason }, query: {},
      user: { _id: user, role: 'procurement_staff', store }
    });
    const concurrentCancellations = await Promise.all([
      invoke(cancelOrder, cancellationRequest('Cancel exact pet')),
      invoke(cancelOrder, cancellationRequest('Concurrent duplicate cancel'))
    ]);
    assert.deepEqual(concurrentCancellations.map(result => result.status).sort(), [200, 409]);
    const [released, other] = await Promise.all([Pet.findById(first.pet._id), Pet.findById(untouched.pet._id)]);
    assert.equal(released.status, 'available');
    assert.equal(released.procurementReservation?.purchaseOrder, undefined);
    assert.equal(other.status, 'available');
    assert.equal((await SupplierProduct.findById(first.product._id)).availableStock, 1);
    assert.equal((await invoke(cancelOrder, cancellationRequest('Later duplicate cancel'))).status, 409);
  });

  await t.test('live-pet catalog mutation cannot override or orphan an exact reservation', async () => {
    const fixture = await makeLivePetProduct('catalog-guard');
    const user = new mongoose.Types.ObjectId();
    await makeCart({ user, supplierProduct: fixture.product, quantity: 1 });
    const submitted = await submit(user);
    const order = await PurchaseOrder.findById(submitted.body.orders[0]._id);
    orderIds.push(order._id);

    const rejectedUpdate = await invoke(updateProduct, {
      params: { id: fixture.product._id },
      body: { availableStock: 1, pet: { description: 'Must roll back' } }, query: {},
      user: { _id: supplierUser, role: 'supplier' }
    });
    assert.equal(rejectedUpdate.status, 409);
    let [reservedPet, catalog] = await Promise.all([
      Pet.findById(fixture.pet._id),
      SupplierProduct.findById(fixture.product._id)
    ]);
    assert.equal(reservedPet.status, 'reserved');
    assert.equal(reservedPet.description, 'Exact procurement pet fixture');
    assert.equal(String(reservedPet.procurementReservation.purchaseOrder), String(order._id));
    assert.equal(catalog.availableStock, 0);

    const metadataUpdate = await invoke(updateProduct, {
      params: { id: fixture.product._id },
      body: { pet: { description: 'Reserved metadata update' } }, query: {},
      user: { _id: supplierUser, role: 'supplier' }
    });
    assert.equal(metadataUpdate.status, 200);
    [reservedPet, catalog] = await Promise.all([
      Pet.findById(fixture.pet._id),
      SupplierProduct.findById(fixture.product._id)
    ]);
    assert.equal(reservedPet.status, 'reserved');
    assert.equal(reservedPet.isAvailable, false);
    assert.equal(reservedPet.description, 'Reserved metadata update');
    assert.equal(catalog.availableStock, 0);

    const rejectedDelete = await invoke(deleteProduct, {
      params: { id: fixture.product._id }, body: {}, query: {},
      user: { _id: supplierUser, role: 'supplier' }
    });
    assert.equal(rejectedDelete.status, 409);

    const cancellation = await invoke(cancelOrder, {
      params: { id: order._id }, body: { reason: 'Release exact reserved pet' }, query: {},
      user: { _id: user, role: 'procurement_staff', store }
    });
    assert.equal(cancellation.status, 200);
    const releasedPet = await Pet.findById(fixture.pet._id);
    assert.equal(releasedPet.status, 'available');
    assert.equal(releasedPet.isAvailable, true);
    assert.equal(releasedPet.procurementReservation?.purchaseOrder, undefined);
    assert.equal((await SupplierProduct.findById(fixture.product._id)).availableStock, 1);
  });

  await t.test('live-pet receiving transfers the exact reserved Pet after a safe catalog metadata edit', async () => {
    const fixture = await makeLivePetProduct('catalog-receiving');
    const user = new mongoose.Types.ObjectId();
    await makeCart({ user, supplierProduct: fixture.product, quantity: 1 });
    const submitted = await submit(user);
    const order = await PurchaseOrder.findById(submitted.body.orders[0]._id);
    orderIds.push(order._id);

    const metadataUpdate = await invoke(updateProduct, {
      params: { id: fixture.product._id },
      body: { pet: { healthNotes: 'Updated while safely reserved' } }, query: {},
      user: { _id: supplierUser, role: 'supplier' }
    });
    assert.equal(metadataUpdate.status, 200);
    await PurchaseOrder.updateOne({ _id: order._id }, {
      $set: { status: 'delivered', inspectionStatus: 'awaiting_inspection' }
    });

    const inspected = await invoke(submitReceivingInspection, {
      params: { id: order._id },
      body: { items: JSON.stringify([{
        purchaseOrderItem: order.items[0]._id,
        receivedQuantity: 1,
        damagedQuantity: 0,
        incorrectQuantity: 0
      }]) },
      files: [], query: {},
      user: { _id: user, role: 'platform_admin' }
    });
    assert.equal(inspected.status, 201);
    const transferred = await Pet.findById(fixture.pet._id);
    assert.equal(String(transferred._id), String(fixture.pet._id));
    assert.equal(String(transferred.acquiredThroughPurchaseOrder), String(order._id));
    assert.equal(String(transferred.store), String(store));
    assert.equal(transferred.listingContext, 'marketplace');
    assert.equal(transferred.status, 'unavailable');
    assert.equal(transferred.approvalStatus, 'pending');
  });

  await t.test('failed exact-pet release rolls back PO cancellation and cannot release an irreversible pet', async () => {
    const fixture = await makeLivePetProduct('rollback');
    const user = new mongoose.Types.ObjectId();
    await makeCart({ user, supplierProduct: fixture.product, quantity: 1 });
    const submitted = await submit(user);
    const order = await PurchaseOrder.findById(submitted.body.orders[0]._id);
    orderIds.push(order._id);
    await SupplierProduct.deleteOne({ _id: fixture.product._id });

    const failed = await invoke(cancelOrder, {
      params: { id: order._id }, body: { reason: 'Force catalog release failure' }, query: {},
      user: { _id: user, role: 'procurement_staff', store }
    });
    assert.equal(failed.status, 409);
    assert.equal((await PurchaseOrder.findById(order._id)).status, 'submitted');
    const stillReserved = await Pet.findById(fixture.pet._id);
    assert.equal(stillReserved.status, 'reserved');
    assert.equal(String(stillReserved.procurementReservation.purchaseOrder), String(order._id));

    await PurchaseOrder.updateOne({ _id: order._id }, { $set: { status: 'delivered', inspectionStatus: 'accepted' } });
    assert.equal((await invoke(cancelOrder, {
      params: { id: order._id }, body: { reason: 'Too late' }, query: {},
      user: { _id: user, role: 'procurement_staff', store }
    })).status, 409);
    assert.equal((await Pet.findById(fixture.pet._id)).status, 'reserved');
  });

  await t.test('shipping and cancellation cannot overwrite each other with stale PO state', async () => {
    const fixture = await makeLivePetProduct('status-race');
    const user = new mongoose.Types.ObjectId();
    await makeCart({ user, supplierProduct: fixture.product, quantity: 1 });
    const submitted = await submit(user);
    const order = await PurchaseOrder.findById(submitted.body.orders[0]._id);
    orderIds.push(order._id);
    await PurchaseOrder.updateOne({ _id: order._id }, { $set: { status: 'processing' } });

    const [cancelled, shipped] = await Promise.all([
      invoke(cancelOrder, {
        params: { id: order._id }, body: { reason: 'Concurrent cancellation' }, query: {},
        user: { _id: user, role: 'procurement_staff', store }
      }),
      invoke(updateOrderStatus, {
        params: { id: order._id }, body: { status: 'shipped' }, query: {},
        user: { _id: supplierUser, role: 'supplier' }
      })
    ]);
    assert.deepEqual([cancelled.status, shipped.status].sort(), [200, 409]);

    const [finalOrder, exactPet] = await Promise.all([
      PurchaseOrder.findById(order._id),
      Pet.findById(fixture.pet._id)
    ]);
    if (finalOrder.status === 'cancelled') {
      assert.equal(exactPet.status, 'available');
      assert.equal(exactPet.procurementReservation?.purchaseOrder, undefined);
      assert.equal((await SupplierProduct.findById(fixture.product._id)).availableStock, 1);
    } else {
      assert.equal(finalOrder.status, 'shipped');
      assert.equal(exactPet.status, 'reserved');
      assert.equal(String(exactPet.procurementReservation.purchaseOrder), String(order._id));
      assert.equal((await SupplierProduct.findById(fixture.product._id)).availableStock, 0);
    }
  });

  await t.test('supplier keeps valid delivery action but cannot return delivered or another supplier order', async () => {
    const allowed = await PurchaseOrder.create({
      orderNumber: `PO-STATE-${nonce}-ALLOWED`, seller: userA, store, supplier: supplierId,
      items: [], subtotal: 0, totalCost: 0, status: 'shipped', paymentTiming: 'after_inspection',
      paymentStatus: 'awaiting_inspection', inspectionStatus: 'awaiting_delivery'
    });
    orderIds.push(allowed._id);
    const delivered = await invoke(updateOrderStatus, {
      params: { id: allowed._id }, body: { status: 'delivered' }, query: {},
      user: { _id: supplierUser, role: 'supplier' }
    });
    assert.equal(delivered.status, 200);
    assert.equal((await PurchaseOrder.findById(allowed._id)).status, 'delivered');

    const returned = await invoke(updateOrderStatus, {
      params: { id: allowed._id }, body: { status: 'returned' }, query: {},
      user: { _id: supplierUser, role: 'supplier' }
    });
    assert.equal(returned.status, 400);
    assert.equal((await PurchaseOrder.findById(allowed._id)).status, 'delivered');
    await PurchaseOrder.updateOne({ _id: allowed._id }, { $set: { inspectionStatus: 'accepted' } });
    assert.equal((await invoke(updateOrderStatus, {
      params: { id: allowed._id }, body: { status: 'returned' }, query: {},
      user: { _id: supplierUser, role: 'supplier' }
    })).status, 400);
    assert.equal((await invoke(updateOrderStatus, {
      params: { id: allowed._id }, body: { status: 'returned' }, query: {},
      user: { _id: otherSupplierUser, role: 'supplier' }
    })).status, 404);
  });

  await t.test('legacy direct endpoint cannot create a PO or trust client state', async () => {
    const before = await PurchaseOrder.countDocuments({ store });
    const result = await invoke(createPurchaseOrder, {
      body: {
        supplierId,
        items: [{ supplierProductId: productIds[0], quantity: 1, unitPrice: 0 }],
        totalCost: 0,
        status: 'completed'
      },
      params: {}, query: {}, user: { _id: userA, role: 'procurement_staff', store }
    });
    assert.equal(result.status, 410);
    assert.equal(result.body.code, 'PROCUREMENT_CART_REQUIRED');
    assert.equal(await PurchaseOrder.countDocuments({ store }), before);
  });
});
