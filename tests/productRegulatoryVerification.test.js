const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildPublicFdaVerification } = require('../services/productRegulatoryVerificationService');

const root = path.join(__dirname, '..');

const product = (overrides = {}) => ({
  _id: 'product-1',
  productMode: 'simple',
  category: 'Pet Food',
  supplierRef: 'supplier-1',
  supplierProductRef: 'supply-1',
  ...overrides
});

const source = (overrides = {}) => ({
  _id: 'supply-1',
  supplier: 'supplier-1',
  category: 'pet_food',
  requiresPlatformReview: true,
  approvalStatus: 'approved',
  reviewedAt: new Date('2026-10-01T00:00:00.000Z'),
  fdaRegistrationExpiry: new Date('2027-10-01T00:00:00.000Z'),
  isActive: true,
  isDeleted: false,
  ...overrides
});

test('public FDA badge requires a current approved regulated supplier source', () => {
  const verification = buildPublicFdaVerification({
    product: product(),
    supplierProduct: source(),
    now: new Date('2026-11-06T00:00:00.000Z')
  });
  assert.deepEqual(verification, {
    authority: 'FDA',
    status: 'approved',
    label: 'FDA Approved',
    detail: 'FDA registration evidence verified by Pawzzle'
  });
});

test('public FDA badge is hidden for unverified, expired, mismatched, variant, and non-regulated records', () => {
  const now = new Date('2026-11-06T00:00:00.000Z');
  const hidden = [
    [product(), source({ approvalStatus: 'pending_review' })],
    [product(), source({ requiresPlatformReview: false })],
    [product(), source({ reviewedAt: undefined })],
    [product(), source({ fdaRegistrationExpiry: new Date('2026-11-05T00:00:00.000Z') })],
    [product({ supplierProductRef: 'another-supply' }), source()],
    [product({ supplierRef: 'another-supplier' }), source()],
    [product({ productMode: 'variant' }), source()],
    [product({ category: 'Pet Accessories' }), source({ category: 'accessories', requiresPlatformReview: false })]
  ];
  for (const [listing, supplierProduct] of hidden) {
    assert.equal(buildPublicFdaVerification({ product: listing, supplierProduct, now }), null);
  }
});

test('customer product detail uses only the server-derived verification response', () => {
  const controller = fs.readFileSync(path.join(root, 'controllers/productController.js'), 'utf8');
  const detail = fs.readFileSync(path.join(root, 'client/src/pages/customer/ProductDetail.js'), 'utf8');
  assert.match(controller, /getPublicProductRegulatoryVerification\(product\)/);
  assert.match(detail, /response\.data\.regulatoryVerification/);
  assert.match(detail, /FDA Approved/);
  assert.match(detail, /Pawzzle does not issue FDA approval/);
  assert.doesNotMatch(detail, /requiresFdaComplianceReview/);
});
