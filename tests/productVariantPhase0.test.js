const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

const Product = require('../models/Product');
const SupplierProduct = require('../models/SupplierProduct');
const ProductVariant = require('../models/ProductVariant');
const SupplierProductVariant = require('../models/SupplierProductVariant');
const Inventory = require('../models/Inventory');
const {
  assertVariantIdentityAvailable,
  buildVariantCombinationKey,
  getProductMode,
  normalizeVariantAttributes,
  normalizeVariantSku
} = require('../utils/variantIdentity');
const {
  resolveProductVariant,
  resolveSupplierProductVariant
} = require('../services/variantResolverService');

const id = () => new mongoose.Types.ObjectId();
const queryReturning = value => ({
  select() { return this; },
  lean: async () => value
});
const attributes = (flavor = 'chicken', size = '1_kg') => [
  { code: 'flavor', label: 'Flavor', valueCode: flavor, valueLabel: flavor === 'chicken' ? 'Chicken' : 'Beef' },
  { code: 'size', label: 'Size', valueCode: size, valueLabel: size.replace('_', ' ') }
];

test('legacy products and supplier supplies default to simple mode without changing parent fields', () => {
  const embeddedVariant = {
    combination: 'Chicken - 1 kg', type: 'Other', price: 125, stock: 7, sku: 'LEGACY-VARIANT-1'
  };
  const product = new Product({
    name: 'Legacy food', category: 'food', description: 'Legacy product', shortDescription: 'Legacy',
    price: 120, stockQuantity: 9, sku: 'LEGACY-PARENT-1', images: ['/legacy.jpg'], addedBy: id(),
    variants: [embeddedVariant]
  });
  const supply = new SupplierProduct({
    supplier: id(), name: 'Legacy supply', sku: 'LEGACY-SUPPLY-1', category: 'pet_food',
    wholesalePrice: 80, availableStock: 25
  });

  assert.equal(product.productMode, 'simple');
  assert.equal(supply.productMode, 'simple');
  assert.equal(getProductMode(undefined), 'simple');
  assert.equal(product.price, 120);
  assert.equal(product.stockQuantity, 9);
  assert.equal(product.variants.length, 1);
  assert.equal(product.variants[0].combination, embeddedVariant.combination);
  assert.equal(product.variants[0].stock, embeddedVariant.stock);
  assert.equal(product.variants[0].sku, embeddedVariant.sku);
});

test('structured attributes canonicalize ordering, casing, and surrounding whitespace', () => {
  const first = buildVariantCombinationKey([
    { code: ' Size ', label: ' Size ', valueCode: ' 1_KG ', valueLabel: ' 1 kg ' },
    { code: 'FLAVOR', label: ' Flavor ', valueCode: ' CHICKEN ', valueLabel: ' Chicken ' }
  ]);
  const second = buildVariantCombinationKey([
    { code: 'flavor', label: 'Flavor', valueCode: 'chicken', valueLabel: 'Chicken' },
    { code: 'size', label: 'Size', valueCode: '1_kg', valueLabel: '1 kg' }
  ]);

  assert.equal(first.combinationKey, second.combinationKey);
  assert.deepEqual(first.attributes.map(entry => entry.code), ['flavor', 'size']);
  assert.deepEqual(first.attributes.map(entry => entry.valueCode), ['chicken', '1_kg']);
});

test('different explicitly defined combinations generate different keys', () => {
  const chicken = buildVariantCombinationKey(attributes('chicken', '1_kg'));
  const beef = buildVariantCombinationKey(attributes('beef', '1_kg'));
  const large = buildVariantCombinationKey(attributes('chicken', '3_kg'));
  assert.notEqual(chicken.combinationKey, beef.combinationKey);
  assert.notEqual(chicken.combinationKey, large.combinationKey);
  assert.match(chicken.combinationKey, /^v1:[a-f0-9]{64}$/);
});

test('empty, malformed, and duplicate attributes are rejected', () => {
  assert.throws(() => normalizeVariantAttributes([]), /At least one variant attribute/);
  assert.throws(() => normalizeVariantAttributes([{ code: '', label: 'Flavor', valueCode: 'beef', valueLabel: 'Beef' }]), /code is required/);
  assert.throws(() => normalizeVariantAttributes([
    { code: 'flavor', label: 'Flavor', valueCode: 'beef', valueLabel: 'Beef' },
    { code: ' FLAVOR ', label: 'Taste', valueCode: 'chicken', valueLabel: 'Chicken' }
  ]), error => error.code === 'DUPLICATE_VARIANT_ATTRIBUTE');
  assert.throws(() => normalizeVariantSku('bad sku!'), /may contain only/);
});

test('product variant validation derives store scope and rejects nonexistent or simple parents', async () => {
  const originalFindById = Product.findById;
  const productId = id();
  const storeId = id();
  try {
    Product.findById = () => queryReturning({ _id: productId, store: storeId, productMode: 'variant' });
    const valid = new ProductVariant({
      product: productId, attributes: attributes(), sku: ' food-1kg ', price: 149.5
    });
    await valid.validate();
    assert.equal(String(valid.store), String(storeId));
    assert.equal(valid.normalizedSku, 'FOOD-1KG');
    assert.match(valid.combinationKey, /^v1:[a-f0-9]{64}$/);

    Product.findById = () => queryReturning(null);
    await assert.rejects(
      new ProductVariant({ product: id(), attributes: attributes(), sku: 'MISSING-1', price: 10 }).validate(),
      /Parent product does not exist/
    );

    Product.findById = () => queryReturning({ _id: productId, store: storeId });
    await assert.rejects(
      new ProductVariant({ product: productId, attributes: attributes(), sku: 'SIMPLE-1', price: 10 }).validate(),
      /must use variant mode/
    );
  } finally {
    Product.findById = originalFindById;
  }
});

test('product variant prices and discontinued state are validated without stock fields', async () => {
  const originalFindById = Product.findById;
  const productId = id();
  try {
    Product.findById = () => queryReturning({ _id: productId, store: id(), productMode: 'variant' });
    await assert.rejects(
      new ProductVariant({ product: productId, attributes: attributes(), sku: 'NEGATIVE-1', price: -1 }).validate(),
      /less than minimum allowed value/
    );
    await assert.rejects(
      new ProductVariant({ product: productId, attributes: attributes(), sku: 'COMPARE-1', price: 100, compareAtPrice: 90 }).validate(),
      /cannot be lower/
    );

    const discontinued = new ProductVariant({
      product: productId, attributes: attributes(), sku: 'OLD-1', price: 100, isDiscontinued: true
    });
    await discontinued.validate();
    assert.equal(discontinued.isActive, false);
    assert.ok(discontinued.discontinuedAt instanceof Date);
    assert.equal(ProductVariant.schema.path('stockQuantity'), undefined);
    assert.equal(ProductVariant.schema.path('stock'), undefined);
  } finally {
    Product.findById = originalFindById;
  }
});

test('supplier variant derives supplier scope and does not inherit parent FDA approval', async () => {
  const originalFindById = SupplierProduct.findById;
  const supplierProductId = id();
  const supplierId = id();
  try {
    SupplierProduct.findById = () => queryReturning({
      _id: supplierProductId,
      supplier: supplierId,
      productMode: 'variant',
      approvalStatus: 'approved',
      requiresPlatformReview: true
    });
    const variant = new SupplierProductVariant({
      supplierProduct: supplierProductId,
      attributes: attributes(),
      sku: 'SUP-CHICKEN-1KG',
      wholesalePrice: 120,
      availableStock: 100
    });
    await variant.validate();
    assert.equal(String(variant.supplier), String(supplierId));
    assert.equal(variant.regulatoryReview.scope, 'not_assessed');
    assert.equal(variant.regulatoryReview.status, 'not_assessed');

    SupplierProduct.findById = () => queryReturning(null);
    await assert.rejects(
      new SupplierProductVariant({
        supplierProduct: id(), attributes: attributes(), sku: 'MISSING-SUPPLY', wholesalePrice: 10
      }).validate(),
      /Parent supplier product does not exist/
    );
  } finally {
    SupplierProduct.findById = originalFindById;
  }
});

test('combination and SKU duplicate checks use parent and owner scopes', async () => {
  const parentId = id();
  const ownerId = id();
  const queries = [];
  const duplicateCombinationModel = {
    exists: async query => {
      queries.push(query);
      return query.combinationKey ? { _id: id() } : null;
    }
  };
  await assert.rejects(assertVariantIdentityAvailable({
    Model: duplicateCombinationModel,
    parentField: 'product', parentId,
    ownerField: 'store', ownerId,
    combinationKey: 'v1:combination', normalizedSku: 'SKU-1'
  }), error => error.code === 'DUPLICATE_VARIANT_COMBINATION');
  assert.equal(String(queries[0].product), String(parentId));
  assert.equal(String(queries[1].store), String(ownerId));

  const duplicateSkuModel = { exists: async query => query.normalizedSku ? { _id: id() } : null };
  await assert.rejects(assertVariantIdentityAvailable({
    Model: duplicateSkuModel,
    parentField: 'supplierProduct', parentId,
    ownerField: 'supplier', ownerId,
    combinationKey: 'v1:other', normalizedSku: 'SKU-1'
  }), error => error.code === 'DUPLICATE_VARIANT_SKU');
});

test('new indexes scope combinations to parents and SKUs to seller or supplier owners', () => {
  const productIndexes = ProductVariant.schema.indexes();
  const supplierIndexes = SupplierProductVariant.schema.indexes();
  assert.ok(productIndexes.some(([keys, options]) => keys.product === 1 && keys.combinationKey === 1 && options.unique));
  assert.ok(productIndexes.some(([keys, options]) => keys.store === 1 && keys.normalizedSku === 1 && options.unique));
  assert.ok(supplierIndexes.some(([keys, options]) => keys.supplierProduct === 1 && keys.combinationKey === 1 && options.unique));
  assert.ok(supplierIndexes.some(([keys, options]) => keys.supplier === 1 && keys.normalizedSku === 1 && options.unique));

  assert.equal(Product.schema.path('sku').options.unique, true);
  assert.ok(SupplierProduct.schema.indexes().some(([keys, options]) => keys.supplier === 1 && keys.sku === 1 && options.unique));
  assert.ok(Inventory.schema.indexes().some(([keys, options]) => keys.store === 1 && keys.product === 1 && options.unique));
});

test('resolver verifies parent ownership and optionally requires an active variant', async () => {
  const originalProductFind = ProductVariant.findById;
  const originalSupplierFind = SupplierProductVariant.findById;
  const productId = id();
  const supplierProductId = id();
  const productVariantId = id();
  const supplierVariantId = id();
  try {
    ProductVariant.findById = async () => ({
      _id: productVariantId, product: productId, isActive: true, isDiscontinued: false
    });
    const productVariant = await resolveProductVariant({ productId, variantId: productVariantId, requireActive: true });
    assert.equal(String(productVariant._id), String(productVariantId));
    ProductVariant.findById = async () => null;
    await assert.rejects(
      resolveProductVariant({ productId, variantId: id() }),
      error => error.code === 'VARIANT_NOT_FOUND'
    );
    ProductVariant.findById = async () => ({
      _id: productVariantId, product: productId, isActive: true, isDiscontinued: false
    });
    await assert.rejects(
      resolveProductVariant({ productId: id(), variantId: productVariantId }),
      error => error.code === 'VARIANT_PARENT_MISMATCH'
    );

    ProductVariant.findById = async () => ({
      _id: productVariantId, product: productId, isActive: false, isDiscontinued: true
    });
    const historical = await resolveProductVariant({ productId, variantId: productVariantId });
    assert.equal(historical.isDiscontinued, true);
    await assert.rejects(
      resolveProductVariant({ productId, variantId: productVariantId, requireActive: true }),
      error => error.code === 'VARIANT_INACTIVE'
    );

    SupplierProductVariant.findById = async () => ({
      _id: supplierVariantId, supplierProduct: supplierProductId, isActive: true, isDiscontinued: false
    });
    const supplierVariant = await resolveSupplierProductVariant({
      supplierProductId, variantId: supplierVariantId, requireActive: true
    });
    assert.equal(String(supplierVariant._id), String(supplierVariantId));
    await assert.rejects(
      resolveSupplierProductVariant({ supplierProductId: id(), variantId: supplierVariantId }),
      error => error.code === 'VARIANT_PARENT_MISMATCH'
    );
  } finally {
    ProductVariant.findById = originalProductFind;
    SupplierProductVariant.findById = originalSupplierFind;
  }
});

test('Phase 0 resolver has no inventory, checkout, payment, or procurement dependency', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'services', 'variantResolverService.js'), 'utf8');
  assert.doesNotMatch(source, /Inventory|Cart|Checkout|Payment|PayMongo|PurchaseOrder|Procurement/i);
});
