const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

process.env.JWT_SECRET ||= 'product-review-test-secret';

const Review = require('../models/Review');
const Order = require('../models/Order');
const {
  ProductReviewError,
  __testing
} = require('../services/productOrderReviewService');
const {
  PRODUCT_INDEX,
  NON_PRODUCT_INDEX,
  isExact,
  safeError
} = require('../scripts/productReviewIndexMaintenance');

const source = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('review schemas scope product uniqueness to the purchased order item', () => {
  assert.ok(Review.schema.path('orderItemId'));
  assert.ok(Order.schema.path('items.reviewStatus.isRated'));
  const indexes = Review.schema.indexes();
  const productIndex = indexes.find(([, options]) => options.name === PRODUCT_INDEX.name);
  const nonProductIndex = indexes.find(([, options]) => options.name === NON_PRODUCT_INDEX.name);
  assert.deepEqual(productIndex?.[0], PRODUCT_INDEX.key);
  assert.equal(productIndex?.[1].unique, true);
  assert.deepEqual(productIndex?.[1].partialFilterExpression, PRODUCT_INDEX.options.partialFilterExpression);
  assert.equal(nonProductIndex?.[1].unique, true);
  assert.equal(indexes.some(([fields]) => fields.user === 1 && fields.orderId === 1 && Object.keys(fields).length === 2), false);
});

test('photo references are bounded and invalid values fail closed', () => {
  assert.deepEqual(__testing.normalizeReviewImages(undefined), []);
  assert.deepEqual(__testing.normalizeReviewImages([' https://images.test/review.jpg ']), ['https://images.test/review.jpg']);
  assert.throws(() => __testing.normalizeReviewImages(new Array(6).fill('image')), ProductReviewError);
  assert.throws(() => __testing.normalizeReviewImages(['']), /invalid/i);
});

test('customer UI carries exact order-item context and keeps store reviews separate', () => {
  const orders = source('client/src/pages/customer/Orders.js');
  const detail = source('client/src/pages/customer/OrderDetail.js');
  const modal = source('client/src/components/OrderReviewModal.js');
  const controller = source('controllers/reviewController.js');
  assert.match(orders, /setRatingProduct\(\{ order, item \}\)/);
  assert.match(orders, /Already Reviewed/);
  assert.doesNotMatch(orders, /targetType="Store"[\s\S]{0,300}ratingOrder/);
  assert.match(detail, /item\.reviewStatus\?\.isRated/);
  assert.match(modal, /orderItemId: item\.orderItemId \|\| item\._id/);
  assert.match(modal, /title="REVIEW PRODUCT"/);
  assert.match(controller, /targetType === 'Product'[\s\S]{0,900}createProductOrderReview/);
  assert.match(controller, /targetType === 'Store'[\s\S]{0,700}getStoreReviewEligibility/);
});

test('maintenance definitions require exact options and redact credentials', () => {
  assert.equal(isExact({ key: PRODUCT_INDEX.key, unique: true, partialFilterExpression: PRODUCT_INDEX.options.partialFilterExpression }, PRODUCT_INDEX), true);
  assert.equal(isExact({ key: PRODUCT_INDEX.key, unique: false, partialFilterExpression: PRODUCT_INDEX.options.partialFilterExpression }, PRODUCT_INDEX), false);
  assert.doesNotMatch(safeError(new Error('mongodb+srv://name:password@example.test/Petshop failed')), /name:password/);
  assert.match(source('scripts/productReviewIndexMaintenance.js'), /if \(!apply\) return/);
  assert.match(source('scripts/productReviewIndexMaintenance.js'), /APPROVE_PRODUCT_REVIEW_INDEX_MIGRATION/);
});
