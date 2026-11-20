const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  REQUIRED_INDEXES,
  indexMatches
} = require('../services/sellerVariantReadinessService');
const {
  APPROVAL_PHRASE,
  indexesReady,
  safeErrorMessage
} = require('../scripts/prepareSellerVariantReadiness');
const Product = require('../models/Product');
const ProductVariant = require('../models/ProductVariant');
const { __test: productVariantTest } = require('../controllers/productVariantController');

const source = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

test('seller variant readiness checks exact production index definitions', () => {
  assert.equal(REQUIRED_INDEXES.ProductVariant.length, 2);
  assert.equal(REQUIRED_INDEXES.SkuClaim.length, 1);
  const required = REQUIRED_INDEXES.SkuClaim[0];
  assert.equal(indexMatches({
    name: required.name,
    key: required.key,
    unique: true,
    partialFilterExpression: required.partialFilterExpression
  }, required), true);
  assert.equal(indexMatches({ key: required.key, unique: false }, required), false);
  assert.equal(indexesReady({ ProductVariant: [{ ready: true }], SkuClaim: [{ ready: true }] }), true);
});

test('seller readiness maintenance is guarded and redacts database credentials', () => {
  assert.equal(APPROVAL_PHRASE, 'PREPARE_SELLER_VARIANTS');
  assert.equal(
    safeErrorMessage(new Error('connect mongodb+srv://user:secret@example.invalid/pawzzle failed')),
    'connect mongodb://<credentials>@example.invalid/pawzzle failed'
  );
  const script = source('scripts/prepareSellerVariantReadiness.js');
  assert.match(script, /process\.argv\.includes\('--apply'\)/);
  assert.match(script, /SELLER_VARIANT_MIGRATION_EXPECTED_DB/);
  assert.doesNotMatch(script, /dropIndex|deleteMany|updateMany/);
});

test('the SKU audit targets the seller registry rather than the supplier registry', () => {
  const audit = source('scripts/auditVariantSkuReadiness.js');
  assert.match(audit, /getSellerVariantReadiness/);
  assert.doesNotMatch(audit, /getSupplierVariantReadiness/);
});

test('variant creation honors safe visibility and keeps the parent minimum price synchronized', () => {
  const controller = source('controllers/productVariantController.js');
  assert.match(controller, /customerBrowsingEnabled: customerReadiness\.browsingEnabled/);
  assert.match(controller, /const visibility = VISIBILITIES\.has\(req\.body\.visibility\)/);
  assert.match(controller, /CUSTOMER_VARIANT_BROWSING_NOT_READY/);
  assert.doesNotMatch(controller, /Variant parents cannot be published by Phase 3/);
  assert.match(controller, /Math\.min\(\.\.\.rows\.map/);
  assert.ok((controller.match(/syncParentVariantPrice\(\{/g) || []).length >= 3);
});

test('parent catalog price follows the lowest active child price', async () => {
  const originalFind = ProductVariant.find;
  const originalUpdateOne = Product.updateOne;
  let update;
  ProductVariant.find = query => {
    assert.deepEqual(query, {
      product: 'parent-1',
      isActive: true,
      isDiscontinued: { $ne: true }
    });
    return {
      select: () => ({
        session: () => ({
          lean: async () => [{ price: 399 }, { price: 249 }, { price: 525 }]
        })
      })
    };
  };
  Product.updateOne = async (...args) => { update = args; };
  try {
    const price = await productVariantTest.syncParentVariantPrice({ productId: 'parent-1', session: 'session-1' });
    assert.equal(price, 249);
    assert.deepEqual(update, [
      { _id: 'parent-1' },
      { $set: { price: 249 } },
      { session: 'session-1' }
    ]);
  } finally {
    ProductVariant.find = originalFind;
    Product.updateOne = originalUpdateOne;
  }
});
