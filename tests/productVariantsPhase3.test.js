const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Inventory = require('../models/Inventory');
const InventoryLot = require('../models/InventoryLot');
const Product = require('../models/Product');
const ProductVariant = require('../models/ProductVariant');
const productVariantController = require('../controllers/productVariantController');
const { buildVariantCombinationKey } = require('../utils/variantIdentity');
const { REQUIRED_INDEXES } = require('../services/variantInventoryReadinessService');

const source = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
const indexByName = Model => new Map(Model.schema.indexes().map(([key, options]) => [options.name, { key, options }]));

test('simple products remain the default and normalized variants do not alter embedded legacy rows', () => {
  const simple = new Product({
    name: 'Legacy food', category: 'food', description: 'Legacy', shortDescription: 'Legacy',
    price: 10, stockQuantity: 3, sku: 'LEGACY-3', images: ['/legacy.jpg'], addedBy: '507f1f77bcf86cd799439011',
    variants: [{ combination: 'Old row', price: 10, stock: 3, sku: 'OLD-ROW', type: 'Size' }]
  });
  assert.equal(simple.productMode, 'simple');
  assert.equal(simple.variants.length, 1);
});
test('inventory schemas define separate partial uniqueness for simple and variant identities', () => {
  const balances = indexByName(Inventory);
  assert.deepEqual(balances.get('inventory_simple_balance_unique').key, { store: 1, product: 1 });
  assert.deepEqual(balances.get('inventory_simple_balance_unique').options.partialFilterExpression, { productVariant: { $exists: false } });
  assert.deepEqual(balances.get('inventory_variant_balance_unique').key, { store: 1, product: 1, productVariant: 1 });
  assert.deepEqual(balances.get('inventory_variant_balance_unique').options.partialFilterExpression, { productVariant: { $type: 'objectId' } });
  const lots = indexByName(InventoryLot);
  assert.ok(lots.has('inventory_lot_simple_unique'));
  assert.ok(lots.has('inventory_lot_variant_unique'));
  assert.equal(REQUIRED_INDEXES.Inventory.length, 2);
  const readiness = source('services/variantInventoryReadinessService.js');
  assert.match(readiness, /invalidBalanceIdentities/);
  assert.match(readiness, /null or invalid productVariant identities/);
});

test('seller variant input uses structured explicit combinations and independent retail prices', () => {
  const input = productVariantController.__test.validateInput({
    attributes: [{ code: 'flavor', label: 'Flavor', valueCode: 'chicken', valueLabel: 'Chicken' }],
    sku: 'DOG-CHICKEN-1KG', price: 225, weight: 1, weightUnit: 'kg'
  });
  assert.equal(input.price, 225);
  assert.equal(input.attributes[0].valueCode, 'chicken');
  assert.throws(() => productVariantController.__test.validateInput({ attributes: [], sku: 'X', price: 1 }));
  assert.throws(() => productVariantController.__test.validateInput({
    attributes: [{ code: 'size', label: 'Size', valueCode: '1kg', valueLabel: '1 kg' }], sku: 'X', price: 0
  }));
});

test('canonical combinations remain deterministic for seller variants', () => {
  const a = buildVariantCombinationKey([
    { code: 'flavor', label: 'Flavor', valueCode: 'chicken', valueLabel: 'Chicken' },
    { code: 'size', label: 'Size', valueCode: '1_kg', valueLabel: '1 kg' }
  ]);
  const b = buildVariantCombinationKey([...a.attributes].reverse());
  assert.equal(a.combinationKey, b.combinationKey);
});

test('receiving applies exact mapped variant and never falls through to parent stock', () => {
  const controller = source('controllers/purchaseOrderController.js');
  const ledger = source('services/inventoryLedgerService.js');
  assert.match(controller, /productVariant: resolved\.sellerVariant\._id/);
  assert.match(controller, /reportItem\.inventoryApplicationStatus = 'applied';[\s\S]*?return;/);
  assert.match(ledger, /Variant products require an exact ProductVariant inventory destination/);
  assert.match(ledger, /if \(!productVariant\)[\s\S]*Product\.findByIdAndUpdate/);
});

test('legacy stock sync explicitly excludes variant balances', () => {
  const stockSync = source('services/stockSyncService.js');
  assert.match(stockSync, /productVariant: \{ \$exists: false \}/);
  assert.doesNotMatch(stockSync, /Inventory\.findOne\(\{ product: productId, store: storeId, isActive: true \}\)/);
});

test('seller variant writes and inventory activation are independently gated', () => {
  const sellerReadiness = source('services/sellerVariantReadinessService.js');
  const inventoryReadiness = source('services/variantInventoryReadinessService.js');
  assert.match(sellerReadiness, /SELLER_VARIANTS_ENABLED/);
  assert.match(sellerReadiness, /SELLER_VARIANTS_CONCURRENCY_VERIFIED/);
  assert.match(sellerReadiness, /SELLER_VARIANTS_AUTHORIZATION_VERIFIED/);
  assert.match(sellerReadiness, /SKU claim registry is not fully backfilled/);
  assert.match(inventoryReadiness, /SELLER_VARIANT_INVENTORY_ENABLED/);
  assert.match(inventoryReadiness, /SELLER_VARIANT_INVENTORY_CONCURRENCY_VERIFIED/);
  assert.match(source('services/inventoryLedgerService.js'), /if \(productVariant\) await assertVariantInventoryEnabled\(\)/);
});

test('Phase 3 remains isolated from customer checkout and payment modules', () => {
  const changedRuntime = [
    'controllers/productVariantController.js', 'services/inventoryLedgerService.js',
    'services/variantInventoryReadinessService.js'
  ].map(source).join('\n');
  assert.doesNotMatch(changedRuntime, /PayMongo|CheckoutSession|PaymentIntent|CartContext/);
});
