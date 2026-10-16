const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Delivery = require('../models/Delivery');
const {
  calculateParcelWeight,
  documentedManualEstimate,
  parcelFromEstimate,
  snapshotProductWeight,
  toMilligrams
} = require('../services/parcelWeightService');

const id = () => new mongoose.Types.ObjectId();
const product = values => new Product({
  name: 'Synthetic product', category: 'food', description: 'Synthetic', shortDescription: 'Synthetic',
  price: 10, stockQuantity: 10, sku: `SKU-${Math.random()}`, images: ['/synthetic.jpg'], addedBy: id(),
  ...values
});
const line = (name, quantity, snapshot) => ({ itemType: 'product', itemId: id(), name, quantity, weightSnapshot: snapshot });

test('integer milligrams preserve mixed grams, kilograms, quantities, and fractional grams', () => {
  assert.equal(toMilligrams(0.75, 'kg'), 750000);
  assert.equal(toMilligrams(1.234, 'g'), 1234);
  const first = snapshotProductWeight(product({ weight: 750, weightUnit: 'g', weightIncludesPackaging: false, packagingWeight: 50, packagingWeightUnit: 'g' }));
  const second = snapshotProductWeight(product({ weight: 1.25, weightUnit: 'kg', weightIncludesPackaging: true }));
  const result = calculateParcelWeight([line('Food', 2, first), line('Bed', 1, second)]);
  assert.equal(result.totalProductWeightMilligrams, 2750000);
  assert.equal(result.additionalPackagingWeightMilligrams, 100000);
  assert.equal(result.estimatedParcelWeightMilligrams, 2850000);
  assert.equal(result.weightKg, 2.85);
  assert.equal(result.status, 'complete');
});

test('packaging already included is never double counted', () => {
  const snapshot = snapshotProductWeight(product({ weight: 2, weightUnit: 'kg', weightIncludesPackaging: true, packagingWeight: 500, packagingWeightUnit: 'g' }));
  const result = calculateParcelWeight([line('Packaged item', 2, snapshot)]);
  assert.equal(result.totalProductWeightMilligrams, 4000000);
  assert.equal(result.additionalPackagingWeightMilligrams, 0);
  assert.equal(result.weightKg, 4);
});

test('unknown packaging is identified without discarding authoritative product weight', () => {
  const snapshot = snapshotProductWeight(product({ weight: 500, weightUnit: 'g', weightIncludesPackaging: false }));
  const result = calculateParcelWeight([line('Unpacked item', 3, snapshot)]);
  assert.equal(result.status, 'product_weight_only');
  assert.equal(result.weightKg, 1.5);
});

test('missing product weight is named and cannot become an automatic zero-weight parcel', () => {
  const result = calculateParcelWeight([line('Legacy item', 1, null)]);
  assert.equal(result.status, 'missing_product_weight');
  assert.equal(result.weightKg, undefined);
  assert.equal(result.missingItems[0].name, 'Legacy item');
  assert.throws(() => parcelFromEstimate(result, {}), /explicitly confirmed documented estimate/);
});

test('automatic parcel ignores a browser-submitted weight and uses its authoritative estimate', () => {
  const estimate = calculateParcelWeight([line('Known item', 2, snapshotProductWeight(product({ weight: 400, weightUnit: 'g' })))]);
  const parcel = parcelFromEstimate(estimate, { weightKg: 0.001, parcelCount: 2 });
  assert.equal(parcel.weightKg, 0.8);
  assert.equal(parcel.parcelCount, 2);
  assert.equal(parcel.measurementSource, 'catalog_estimate');
});

test('documented manual estimates require confirmation and a meaningful reason', () => {
  assert.throws(() => documentedManualEstimate({ weightKg: 2, parcelCount: 1, manualException: true, confirmed: true, manualExceptionReason: 'short' }), /between 10 and 500/);
  const parcel = documentedManualEstimate({ weightKg: 2.125, parcelCount: 1, manualException: true, confirmed: true, manualExceptionReason: 'Measured on the Store packing scale.' });
  assert.equal(parcel.measurementSource, 'documented_manual_estimate');
  assert.equal(parcel.weightMilligrams, 2125000);
});

test('schemas preserve additive legacy compatibility and explicit provenance', () => {
  assert.equal(new Product({}).weightIncludesPackaging, true);
  assert.ok(Order.schema.path('items.weightSnapshot.productWeightMilligrams'));
  assert.ok(Order.schema.path('parcelEstimate.estimatedParcelWeightMilligrams'));
  assert.ok(Delivery.schema.path('parcel.manualExceptionReason'));
});
