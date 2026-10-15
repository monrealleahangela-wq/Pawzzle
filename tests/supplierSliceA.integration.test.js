const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const SupplierProduct = require('../models/SupplierProduct');
const PurchaseOrder = require('../models/PurchaseOrder');
const ProcurementCart = require('../models/ProcurementCart');
const Supplier = require('../models/Supplier');
const ServiceSupply = require('../models/ServiceSupply');
const SupplyChainLog = require('../models/SupplyChainLog');
const ProcurementReceivingReport = require('../models/ProcurementReceivingReport');
const { commitPurchaseOrderStock } = require('../services/procurementStockCommitmentService');
const { applyServiceSupplyReceipt } = require('../services/serviceSupplyReceivingService');
const { submitProcurementCart, getComparableSupplierOffers, confirmSupplierOfferMatch,
  submitReceivingInspection } = require('../controllers/purchaseOrderController');

const configuredUri = process.env.MONGODB_TRANSACTION_TEST_URI;

test('isolated MongoDB permits exactly one competing supplier-stock commitment', {
  skip: !configuredUri && 'MONGODB_TRANSACTION_TEST_URI is not configured'
}, async () => {
  const parsed = new URL(configuredUri);
  assert.equal(parsed.protocol, 'mongodb:');
  assert.equal(parsed.hostname, '127.0.0.1');
  assert.equal(parsed.port, '27018');
  assert.equal(parsed.searchParams.get('replicaSet'), 'pawzzleTestRS');
  const dbName = `pawzzle_supplier_slicea_${crypto.randomBytes(6).toString('hex')}`;
  parsed.pathname = `/${dbName}`;
  await mongoose.connect(parsed.toString(), { serverSelectionTimeoutMS: 5000 });
  try {
    const supplierId = new mongoose.Types.ObjectId();
    const sellerId = new mongoose.Types.ObjectId();
    const storeId = new mongoose.Types.ObjectId();
    const product = await SupplierProduct.create({ supplier: supplierId, name: 'Synthetic supply',
      sku: 'SYNTHETIC-1', category: 'pet_food', wholesalePrice: 20, availableStock: 5 });
    const makeOrder = suffix => new PurchaseOrder({
      orderNumber: `PO-SYNTHETIC-${suffix}`, supplier: supplierId, seller: sellerId, store: storeId,
      subtotal: 80, totalCost: 80, items: [{ supplierProduct: product._id,
        itemType: 'pet_supply', productName: 'Synthetic supply', quantity: 4,
        unitPrice: 20, totalPrice: 80 }]
    });
    const results = await Promise.allSettled([makeOrder('A'), makeOrder('B')].map(order =>
      mongoose.connection.transaction(async session => {
        await order.save({ session });
        await commitPurchaseOrderStock({ order, session });
        await order.save({ session });
      })));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter(result => result.status === 'rejected').length, 1);
    assert.equal((await SupplierProduct.findById(product._id)).availableStock, 1);
    assert.equal(await PurchaseOrder.countDocuments({ supplier: supplierId }), 1);
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
test('isolated MongoDB cannot submit one service-supply cart twice under concurrency', {
  skip: !configuredUri && 'MONGODB_TRANSACTION_TEST_URI is not configured'
}, async () => {
  const parsed = new URL(configuredUri);
  assert.equal(parsed.protocol, 'mongodb:');
  assert.equal(parsed.hostname, '127.0.0.1');
  assert.equal(parsed.port, '27018');
  assert.equal(parsed.searchParams.get('replicaSet'), 'pawzzleTestRS');
  parsed.pathname = `/pawzzle_supply_cart_${crypto.randomBytes(6).toString('hex')}`;
  await mongoose.connect(parsed.toString(), { serverSelectionTimeoutMS: 5000 });
  try {
    const store = new mongoose.Types.ObjectId();
    const seller = new mongoose.Types.ObjectId();
    const supplierUser = new mongoose.Types.ObjectId();
    const supplier = await Supplier.create({ user: supplierUser, businessName: 'Synthetic supplier',
      contactPerson: 'Test', email: `synthetic-${crypto.randomBytes(4).toString('hex')}@example.test`,
      phone: '0000000000', address: { street: 'Test', city: 'Test', province: 'Test' },
      supplierType: 'platform', status: 'verified', isActive: true });
    const offer = await SupplierProduct.create({ supplier: supplier._id, name: 'Synthetic shampoo',
      sku: 'CART-SHAMPOO', category: 'grooming_supplies', itemType: 'pet_supply',
      unitOfMeasure: 'bottle', wholesalePrice: 40, availableStock: 5 });
    const supply = await ServiceSupply.create({ store, addedBy: seller, name: 'Shampoo',
      category: 'grooming_supplies', unitOfMeasure: 'bottle', maximumStock: 20,
      supplierOffers: [{ supplierProduct: offer._id, matchType: 'exact', confirmedBy: seller, confirmedAt: new Date() }] });
    const otherStore = new mongoose.Types.ObjectId();
    const otherSupplier = await Supplier.create({ user: new mongoose.Types.ObjectId(),
      businessName: 'Other Store only', contactPerson: 'Test',
      email: `other-${crypto.randomBytes(4).toString('hex')}@example.test`,
      phone: '0000000001', address: { street: 'Test', city: 'Test', province: 'Test' },
      supplierType: 'store_added', status: 'verified', isActive: true,
      storeAssociations: [{ store: otherStore, addedBy: seller, status: 'active' }] });
    await SupplierProduct.create({ supplier: otherSupplier._id, name: 'Restricted shampoo',
      sku: 'CART-RESTRICTED', category: 'grooming_supplies', itemType: 'pet_supply',
      unitOfMeasure: 'bottle', wholesalePrice: 20, availableStock: 5 });
    const compare = async userStore => {
      const result = { status: 200 };
      const response = { status(code) { result.status = code; return this; },
        json(body) { result.body = body; return this; } };
      await getComparableSupplierOffers({ user: { _id: seller, store: userStore, role: 'store_owner' },
        params: { storeProductId: String(supply._id) }, query: { targetType: 'service_supply' } }, response);
      return result;
    };
    const allowedOffers = await compare(store);
    assert.equal(allowedOffers.status, 200);
    assert.deepEqual(allowedOffers.body.offers.map(item => String(item.supplierProductId)), [String(offer._id)]);
    assert.equal((await compare(otherStore)).status, 404);
    const alternate = await SupplierProduct.create({ supplier: supplier._id, name: 'Alternative shampoo',
      sku: 'CART-ALT', category: 'grooming_supplies', itemType: 'pet_supply',
      unitOfMeasure: 'bottle', wholesalePrice: 42, availableStock: 4 });
    const confirm = async userStore => {
      const result = { status: 200 };
      const response = { status(code) { result.status = code; return this; },
        json(body) { result.body = body; return this; } };
      await confirmSupplierOfferMatch({ user: { _id: seller, store: userStore, role: 'store_owner' },
        body: { targetType: 'service_supply', serviceSupplyId: String(supply._id),
          supplierProductId: String(alternate._id), matchType: 'equivalent', confirmMatch: true } }, response);
      return result;
    };
    assert.equal((await confirm(otherStore)).status, 409);
    assert.equal((await confirm(store)).status, 201);
    assert.equal((await confirm(store)).status, 200);
    assert.equal((await ServiceSupply.findById(supply._id)).supplierOffers.length, 2);
    await ProcurementCart.create({ user: seller, store, items: [{ supplierProduct: offer._id,
      supplier: supplier._id, itemType: 'pet_supply', quantity: 4, addedUnitPrice: 40,
      serviceSupply: supply._id, selectionMatchType: 'exact', selectionConfirmedBy: seller,
      selectionConfirmedAt: new Date() }] });
    const invoke = async () => {
      const result = { status: 200 };
      const response = { status(code) { result.status = code; return this; },
        json(body) { result.body = body; return this; } };
      await submitProcurementCart({ user: { _id: seller, store, role: 'store_owner' },
        body: { confirmSplit: true, paymentTiming: 'after_inspection' } }, response);
      return result;
    };
    const results = await Promise.all([invoke(), invoke()]);
    assert.equal(results.filter(result => result.status === 201).length, 1);
    assert.equal(await PurchaseOrder.countDocuments({ store }), 1);
    assert.equal((await SupplierProduct.findById(offer._id)).availableStock, 1);
    assert.equal((await ProcurementCart.findOne({ user: seller, store })).items.length, 0);
    const order = await PurchaseOrder.findOne({ store });
    assert.equal(String(order.items[0].serviceSupply), String(supply._id));
    assert.equal(order.items[0].supplierStockCommittedQuantity, 4);
    assert.equal(order.items[0].unitPrice, 40);
    assert.equal(order.items[0].supplierNameSnapshot, supplier.businessName);
    assert.equal(order.paymentStatus, 'awaiting_inspection');
    await PurchaseOrder.updateOne({ _id: order._id }, { $set: { status: 'delivered' } });
    const inspect = async userStore => {
      const result = { status: 200 };
      const response = { status(code) { result.status = code; return this; },
        json(body) { result.body = body; return this; } };
      await submitReceivingInspection({ user: { _id: seller, store: userStore, role: 'store_owner' },
        params: { id: String(order._id) }, files: [], body: { items: [{
          purchaseOrderItem: String(order.items[0]._id), receivedQuantity: 3,
          damagedQuantity: 0, incorrectQuantity: 0
        }] } }, response);
      return result;
    };
    assert.equal((await inspect(otherStore)).status, 403);
    const accepted = await inspect(store);
    assert.equal(accepted.status, 201);
    assert.equal((await ServiceSupply.findById(supply._id)).currentStock, 3);
    assert.equal((await PurchaseOrder.findById(order._id)).items[0].receivedQuantity, 3);
    assert.equal((await ProcurementReceivingReport.findOne({ purchaseOrder: order._id })).items[0].acceptedQuantity, 3);
    assert.equal((await inspect(store)).status, 409);
    assert.equal((await ServiceSupply.findById(supply._id)).currentStock, 3);
    assert.equal((await SupplierProduct.findById(offer._id)).availableStock, 1);
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

test('isolated MongoDB receives service supplies once, reconciles partial receipts, and serializes concurrent receipts', {
  skip: !configuredUri && 'MONGODB_TRANSACTION_TEST_URI is not configured'
}, async () => {
  const parsed = new URL(configuredUri);
  assert.equal(parsed.protocol, 'mongodb:');
  assert.equal(parsed.hostname, '127.0.0.1');
  assert.equal(parsed.port, '27018');
  assert.equal(parsed.searchParams.get('replicaSet'), 'pawzzleTestRS');
  parsed.pathname = `/pawzzle_supply_receiving_${crypto.randomBytes(6).toString('hex')}`;
  await mongoose.connect(parsed.toString(), { serverSelectionTimeoutMS: 5000 });
  try {
    await SupplyChainLog.init();
    const store = new mongoose.Types.ObjectId();
    const supplier = new mongoose.Types.ObjectId();
    const actor = new mongoose.Types.ObjectId();
    const offer = await SupplierProduct.create({ supplier, name: 'Synthetic shampoo', sku: 'SYN-SHAMPOO',
      category: 'grooming_supplies', itemType: 'pet_supply', unitOfMeasure: 'bottle',
      wholesalePrice: 40, availableStock: 20 });
    const supply = await ServiceSupply.create({ store, addedBy: actor, name: 'Shampoo', category: 'grooming_supplies',
      unitOfMeasure: 'bottle', currentStock: 1, maximumStock: 20,
      supplierOffers: [{ supplierProduct: offer._id, matchType: 'exact', confirmedBy: actor, confirmedAt: new Date() }] });
    const makeOrder = async (suffix, quantity) => PurchaseOrder.create({
      orderNumber: `PO-SERVICE-${suffix}`, seller: actor, store, supplier,
      subtotal: quantity * 40, totalCost: quantity * 40,
      items: [{ supplierProduct: offer._id, serviceSupply: supply._id, itemType: 'pet_supply',
        productName: 'Synthetic shampoo', quantity, unitPrice: 40, totalPrice: quantity * 40 }]
    });
    const first = await makeOrder('FIRST', 5);
    const receive = async (orderId, accepted, key, previousOverride) => mongoose.connection.transaction(async session => {
      const order = await PurchaseOrder.findById(orderId).session(session);
      const item = order.items[0];
      const previousQuantity = previousOverride ?? Number(item.receivedQuantity || 0);
      await applyServiceSupplyReceipt({ order, orderItem: item, supplierProduct: offer,
        acceptedQuantity: accepted, previousQuantity,
        receivedQuantityTarget: previousQuantity + accepted,
        userId: actor, userRole: 'store_owner', session, idempotencyKey: key });
      item.receivedQuantity = previousQuantity + accepted;
      await order.save({ session });
    });
    await receive(first._id, 3, 'supply-receipt:first');
    assert.equal((await ServiceSupply.findById(supply._id)).currentStock, 4);
    await assert.rejects(receive(first._id, 3, 'supply-receipt:first', 0));
    assert.equal((await ServiceSupply.findById(supply._id)).currentStock, 4);
    await receive(first._id, 2, 'supply-receipt:reinspection');
    assert.equal((await PurchaseOrder.findById(first._id)).items[0].receivedQuantity, 5);
    const [second, third] = await Promise.all([makeOrder('SECOND', 2), makeOrder('THIRD', 2)]);
    const results = await Promise.allSettled([
      receive(second._id, 2, 'supply-receipt:second'),
      receive(third._id, 2, 'supply-receipt:third')
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 2);
    assert.equal((await ServiceSupply.findById(supply._id)).currentStock, 10);
    assert.equal(await SupplyChainLog.countDocuments({ idempotencyKey: /^supply-receipt:/ }), 4);
    await assert.rejects(mongoose.connection.transaction(async session => {
      await applyServiceSupplyReceipt({ order: first, orderItem: first.items[0], supplierProduct: offer,
        acceptedQuantity: 11, previousQuantity: 5, receivedQuantityTarget: 16,
        userId: actor, userRole: 'store_owner', session, idempotencyKey: 'supply-receipt:over-capacity' });
    }), /capacity/);
    assert.equal((await ServiceSupply.findById(supply._id)).currentStock, 10);
    assert.equal(await SupplyChainLog.countDocuments({ idempotencyKey: 'supply-receipt:over-capacity' }), 0);
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
