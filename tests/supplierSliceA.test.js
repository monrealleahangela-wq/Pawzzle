const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const ServiceSupply = require('../models/ServiceSupply');
const SupplierProduct = require('../models/SupplierProduct');
const PurchaseOrder = require('../models/PurchaseOrder');
const ProcurementCart = require('../models/ProcurementCart');
const Supplier = require('../models/Supplier');
const Notification = require('../models/Notification');
const SupplyChainLog = require('../models/SupplyChainLog');
const { getComparableSupplierOffers, confirmSupplierOfferMatch } = require('../controllers/purchaseOrderController');
const {
  getOfferMatchType, getOfferReviewIssue, getStoreProductCompatibilityIssue
} = require('../utils/procurementProductLinking');
const { groupProcurementItemsBySupplier } = require('../utils/procurementCart');
const { getSupplyOfferMatchType, getSupplyOfferIssue } = require('../utils/procurementSupplyLinking');

const id = () => new mongoose.Types.ObjectId();
const store = id();
const actor = id();
const firstSupplier = id();
const secondSupplier = id();
const firstOffer = id();
const secondOffer = id();

const storeProduct = () => ({
  _id: id(), store, name: 'Pet food', category: 'Pet Food', unit: 'bag',
  supplierProductRef: firstOffer, isActive: true, isDeleted: false,
  procurementOffers: [{ supplierProduct: secondOffer, matchType: 'equivalent', confirmedBy: actor, confirmedAt: new Date() }]
});
const offer = (offerId, supplierId) => ({
  _id: offerId, supplier: supplierId, itemType: 'pet_supply', category: 'pet_food',
  unitOfMeasure: 'bag', name: 'Food', wholesalePrice: 250, availableStock: 7,
  minimumOrderQuantity: 1
});

test('a Store product distinguishes its primary exact offer from a reviewed equivalent', () => {
  const product = storeProduct();
  assert.equal(getOfferMatchType({ storeProduct: product, supplierProduct: offer(firstOffer, firstSupplier) }), 'exact');
  assert.equal(getOfferMatchType({ storeProduct: product, supplierProduct: offer(secondOffer, secondSupplier) }), 'equivalent');
  assert.equal(getOfferMatchType({ storeProduct: product, supplierProduct: offer(id(), id()) }), null);
  assert.equal(getStoreProductCompatibilityIssue({ storeProduct: product, supplierProduct: offer(secondOffer, secondSupplier), storeId: store }), null);
  assert.match(getStoreProductCompatibilityIssue({ storeProduct: product, supplierProduct: offer(id(), id()), storeId: store }), /different supplier/);
});

test('service supplies require explicit reviewed offers even when a legacy singular supplier reference exists', () => {
  const supply = new ServiceSupply({ store, addedBy: actor, name: 'Shampoo',
    category: 'grooming_supplies', unitOfMeasure: 'bottle', supplierProduct: firstOffer,
    supplierOffers: [{ supplierProduct: secondOffer, matchType: 'equivalent',
      confirmedBy: actor, confirmedAt: new Date() }] });
  const supplierOffer = { ...offer(secondOffer, secondSupplier), category: 'grooming_supplies', unitOfMeasure: 'bottle' };
  assert.equal(supply.validateSync(), undefined);
  assert.equal(getSupplyOfferMatchType({ serviceSupply: supply, supplierProduct: { _id: firstOffer } }), null);
  assert.equal(getSupplyOfferMatchType({ serviceSupply: supply, supplierProduct: supplierOffer }), 'equivalent');
  assert.equal(getSupplyOfferIssue({ serviceSupply: supply, supplierProduct: supplierOffer, storeId: store }), null);
  assert.match(getSupplyOfferIssue({ serviceSupply: supply, supplierProduct: supplierOffer, storeId: id() }), /another Store/);
  assert.match(getSupplyOfferIssue({ serviceSupply: supply, supplierProduct: { ...supplierOffer, unitOfMeasure: 'pack' }, storeId: store }), /units must match/);
  assert.match(getSupplyOfferIssue({ serviceSupply: supply, supplierProduct: { ...supplierOffer, category: 'medical_supplies' }, storeId: store }), /categories must match/);
  assert.match(getSupplyOfferIssue({ serviceSupply: supply, supplierProduct: { ...supplierOffer, _id: id() }, storeId: store }), /Review this supplier offer/);
});

test('supplier catalog supports service-supply categories and units without conflating supplier stock', () => {
  for (const category of ['consumables', 'equipment']) {
    const catalogItem = new SupplierProduct({ supplier: firstSupplier, itemType: 'pet_supply',
      name: `Synthetic ${category}`, sku: category.toUpperCase(), category,
      unitOfMeasure: category === 'consumables' ? 'ml' : 'set', wholesalePrice: 12, availableStock: 7 });
    assert.equal(catalogItem.validateSync(), undefined);
  }
  const supply = new ServiceSupply({ store, addedBy: actor, name: 'Liquid cleaner',
    category: 'consumables', unitOfMeasure: 'ml' });
  const matching = { _id: id(), itemType: 'pet_supply', category: 'consumables', unitOfMeasure: 'ml' };
  assert.equal(getSupplyOfferIssue({ serviceSupply: supply, supplierProduct: matching,
    storeId: store, matchType: 'equivalent' }), null);
});

test('cart and PO preserve a service-supply destination and supplier-specific immutable price snapshot', () => {
  const supplyId = id();
  const cart = new ProcurementCart({ user: actor, store, items: [{ supplierProduct: secondOffer,
    supplier: secondSupplier, quantity: 3, addedUnitPrice: 90, serviceSupply: supplyId,
    selectionMatchType: 'exact', selectionConfirmedBy: actor, selectionConfirmedAt: new Date() }] });
  const order = new PurchaseOrder({ orderNumber: 'PO-SERVICE-SNAPSHOT', seller: actor, store,
    supplier: secondSupplier, subtotal: 270, totalCost: 270,
    items: [{ supplierProduct: secondOffer, serviceSupply: supplyId, itemType: 'pet_supply',
      productName: 'Shampoo', sku: 'SYN-2', supplierNameSnapshot: 'Synthetic supplier B',
      unitOfMeasureSnapshot: 'bottle', selectionMatchType: 'exact', quantity: 3,
      unitPrice: 90, totalPrice: 270 }] });
  assert.equal(cart.validateSync(), undefined);
  assert.equal(order.validateSync(), undefined);
  assert.equal(String(order.items[0].serviceSupply), String(supplyId));
  assert.equal(order.items[0].unitPrice, 90);
});

test('offer review rejects cross-Store, live-pet, incompatible-unit and category mappings', () => {
  const product = storeProduct();
  assert.match(getOfferReviewIssue({ storeProduct: product, supplierProduct: offer(secondOffer, secondSupplier), storeId: id(), matchType: 'exact' }), /another Store/);
  assert.match(getOfferReviewIssue({ storeProduct: product, supplierProduct: { ...offer(secondOffer, secondSupplier), itemType: 'live_pet' }, storeId: store, matchType: 'exact' }), /live pets/);
  assert.match(getOfferReviewIssue({ storeProduct: product, supplierProduct: { ...offer(secondOffer, secondSupplier), unitOfMeasure: 'box' }, storeId: store, matchType: 'equivalent' }), /units must match/);
  assert.match(getOfferReviewIssue({ storeProduct: product, supplierProduct: { ...offer(secondOffer, secondSupplier), category: 'toys' }, storeId: store, matchType: 'equivalent' }), /categories are incompatible/);
  assert.equal(getOfferReviewIssue({ storeProduct: product, supplierProduct: offer(secondOffer, secondSupplier), storeId: store, matchType: 'equivalent' }), null);
});

test('supplier stock and price remain separate and procurement groups orders by supplier', () => {
  const a = new SupplierProduct({ supplier: firstSupplier, itemType: 'pet_supply', category: 'pet_food', name: 'Food', sku: 'A', wholesalePrice: 250, availableStock: 7 });
  const b = new SupplierProduct({ supplier: secondSupplier, itemType: 'pet_supply', category: 'pet_food', name: 'Food', sku: 'B', wholesalePrice: 265, availableStock: 3 });
  assert.equal(a.validateSync(), undefined);
  assert.equal(b.validateSync(), undefined);
  assert.notEqual(a.supplier.toString(), b.supplier.toString());
  assert.equal(a.availableStock, 7);
  assert.equal(b.availableStock, 3);
  const grouped = groupProcurementItemsBySupplier([
    { supplier: { _id: firstSupplier }, orderItem: { quantity: 5, unitPrice: a.wholesalePrice } },
    { supplier: { _id: secondSupplier }, orderItem: { quantity: 2, unitPrice: b.wholesalePrice } }
  ]);
  assert.equal(grouped.size, 2);
});

test('cart and PO items preserve explicit selection and historical supplier snapshots', () => {
  const product = storeProduct();
  const cart = new ProcurementCart({ user: actor, store, items: [{
    supplierProduct: secondOffer, supplier: secondSupplier, quantity: 2,
    storeProduct: product._id, addedUnitPrice: 265, selectionMatchType: 'equivalent',
    selectionConfirmedBy: actor, selectionConfirmedAt: new Date()
  }] });
  assert.equal(cart.validateSync(), undefined);
  const order = new PurchaseOrder({
    orderNumber: 'PO-SLICE-A-TEST', seller: actor, store, supplier: secondSupplier,
    subtotal: 530, totalCost: 530,
    items: [{ supplierProduct: secondOffer, storeProduct: product._id, itemType: 'pet_supply',
      productName: 'Food', sku: 'B', supplierNameSnapshot: 'Supplier B',
      unitOfMeasureSnapshot: 'bag', selectionMatchType: 'equivalent',
      selectionConfirmedBy: actor, selectionConfirmedAt: new Date(),
      quantity: 2, unitPrice: 265, totalPrice: 530 }]
  });
  assert.equal(order.validateSync(), undefined);
  assert.equal(order.items[0].supplierNameSnapshot, 'Supplier B');
  assert.equal(order.items[0].unitPrice, 265);
  assert.equal(order.items[0].selectionMatchType, 'equivalent');
});

const invoke = async (handler, req) => {
  const result = { status: 200 };
  await handler(req, {
    status(value) { result.status = value; return this; },
    json(value) { result.body = value; return this; }
  });
  return result;
};

test('comparison endpoint denies a customer and another Store before disclosing offers', async () => {
  const originalFindOne = Product.findOne;
  try {
    const customer = await invoke(getComparableSupplierOffers, {
      user: { _id: actor, role: 'customer', store }, params: { storeProductId: String(id()) }, query: {}
    });
    assert.equal(customer.status, 403);
    Product.findOne = () => ({ select: async () => null });
    const unrelatedStore = await invoke(getComparableSupplierOffers, {
      user: { _id: actor, role: 'manager', store }, params: { storeProductId: String(id()) }, query: {}
    });
    assert.equal(unrelatedStore.status, 404);
  } finally { Product.findOne = originalFindOne; }
});

test('comparison returns only Store-eligible supplier offers and never labels unreviewed candidates exact', async () => {
  const originals = { productFindOne: Product.findOne, supplierFind: Supplier.find, offerFind: SupplierProduct.find,
    offerCount: SupplierProduct.countDocuments };
  const product = storeProduct();
  let offerFilter;
  try {
    Product.findOne = () => ({ select: async () => product });
    Supplier.find = () => ({ select: async () => [{ _id: firstSupplier, businessName: 'Supplier A' }, { _id: secondSupplier, businessName: 'Supplier B' }] });
    SupplierProduct.find = filter => {
      offerFilter = filter;
      return { select: () => ({ sort: () => ({ skip: () => ({ limit: async () => [
        offer(firstOffer, firstSupplier), offer(secondOffer, secondSupplier)
      ] }) }) }) };
    };
    SupplierProduct.countDocuments = async () => 2;
    const result = await invoke(getComparableSupplierOffers, {
      user: { _id: actor, role: 'manager', store }, params: { storeProductId: String(product._id) }, query: {}
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.offers.length, 2);
    assert.deepEqual(result.body.offers.map(item => item.matchType), ['exact', 'equivalent']);
    const scopedFilter = offerFilter.$and?.[0] || offerFilter;
    assert.deepEqual(scopedFilter.supplier.$in.map(String), [String(firstSupplier), String(secondSupplier)]);
    assert.ok(offerFilter.$and?.[1].$or.some(clause => clause.approvalStatus === 'approved'));
  } finally {
    Product.findOne = originals.productFindOne;
    Supplier.find = originals.supplierFind;
    SupplierProduct.find = originals.offerFind;
    SupplierProduct.countDocuments = originals.offerCount;
  }
});

test('offer confirmation rejects missing explicit buyer consent before any database mutation', async () => {
  const result = await invoke(confirmSupplierOfferMatch, {
    user: { _id: actor, role: 'manager', store },
    body: { storeProductId: String(id()), supplierProductId: String(id()), matchType: 'equivalent' }
  });
  assert.equal(result.status, 400);
  assert.match(result.body.message, /Explicit confirmation/);
});

test('confirmed offer classification and audit commit together; repeated confirmation is idempotent', async () => {
  const originals = {
    productFindOne: Product.findOne, offerFindOne: SupplierProduct.findOne,
    supplierFindById: Supplier.findById, transaction: mongoose.connection.transaction,
    logCreate: SupplyChainLog.create
  };
  const storeItem = storeProduct();
  storeItem.procurementOffers = [];
  storeItem.save = async () => storeItem;
  const selectedOffer = offer(secondOffer, secondSupplier);
  let audits = 0;
  try {
    Product.findOne = () => ({ session: async () => storeItem,
      then(resolve, reject) { return Promise.resolve(storeItem).then(resolve, reject); } });
    SupplierProduct.findOne = async () => selectedOffer;
    Supplier.findById = async () => ({ _id: secondSupplier, status: 'verified', isActive: true, isDeleted: false });
    mongoose.connection.transaction = async callback => callback({ isolated: true });
    SupplyChainLog.create = async () => { audits += 1; return []; };
    const req = { user: { _id: actor, role: 'manager', store },
      body: { storeProductId: String(storeItem._id), supplierProductId: String(secondOffer), matchType: 'equivalent', confirmMatch: true } };
    const first = await invoke(confirmSupplierOfferMatch, req);
    const repeat = await invoke(confirmSupplierOfferMatch, req);
    assert.equal(first.status, 201);
    assert.equal(repeat.status, 200);
    assert.equal(storeItem.procurementOffers.length, 1);
    assert.equal(audits, 1);
  } finally {
    Product.findOne = originals.productFindOne;
    SupplierProduct.findOne = originals.offerFindOne;
    Supplier.findById = originals.supplierFindById;
    mongoose.connection.transaction = originals.transaction;
    SupplyChainLog.create = originals.logCreate;
  }
});

test('shortage notifications have a unique deduplication key for one recipient and event', () => {
  assert.ok(Notification.schema.indexes().some(([keys, options]) => keys.dedupeKey === 1 && options.unique && options.sparse));
});
