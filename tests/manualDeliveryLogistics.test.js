const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Delivery = require('../models/Delivery');
const {
  buildDeliveryQueryFilters,
  normalizeManualAddress,
  normalizeManualDelivery,
  parseManilaDate
} = require('../utils/manualDelivery');

const id = () => new mongoose.Types.ObjectId();

test('normalizes selected address metadata only when a valid coordinate pair exists', () => {
  assert.deepEqual(normalizeManualAddress({ formattedAddress: '12 Demo Street, Imus, Cavite', placeId: 123, coordinates: { lat: '14.4', lng: '120.9' } }), {
    formattedAddress: '12 Demo Street, Imus, Cavite', street: '', barangay: '', city: '', province: '', zipCode: '', country: '',
    placeId: '123', coordinates: { lat: 14.4, lng: 120.9 }
  });
  assert.deepEqual(normalizeManualAddress({ formattedAddress: 'Typed address without a selected suggestion' }), {
    formattedAddress: 'Typed address without a selected suggestion', street: '', barangay: '', city: '', province: '', zipCode: '', country: ''
  });
  assert.throws(() => normalizeManualAddress({ formattedAddress: 'Broken coordinates', coordinates: { lat: 14.4 } }), /valid latitude and longitude pair/);
});
test('validates complete manual delivery input without inventing coordinates', () => {
  const actor = id();
  const value = normalizeManualDelivery({
    recipientName: 'Demo Recipient', recipientPhone: '09170000000', idempotencyKey: 'request-1',
    pickupAddress: { formattedAddress: 'Store pickup address' },
    dropoffAddress: { formattedAddress: 'Customer delivery address' }
  }, actor);
  assert.equal(value.createdBy, actor);
  assert.equal(value.pickupAddress.coordinates, undefined);
  assert.equal(value.dropoffAddress.placeId, undefined);
  assert.throws(() => normalizeManualDelivery({ recipientName: '', recipientPhone: '09170000000' }, actor), /Recipient name/);
});
test('manual delivery schema remains optional for legacy records and validates complete manual records', async () => {
  const legacy = new Delivery({ order: id() });
  await legacy.validate();
  assert.equal(legacy.manualDelivery, undefined);

  const actor = id();
  const manual = new Delivery({
    store: id(), sourceType: 'manual', status: 'pending',
    manualDelivery: normalizeManualDelivery({
      recipientName: 'Demo Recipient', recipientPhone: '09170000000', idempotencyKey: 'request-2',
      pickupAddress: { formattedAddress: 'Store pickup address' },
      dropoffAddress: { formattedAddress: 'Customer delivery address' }
    }, actor)
  });
  await manual.validate();
  assert.equal(manual.manualDelivery.dropoffAddress.formattedAddress, 'Customer delivery address');
});

test('manual request idempotency uses the named unique partial Store index', () => {
  const [, options] = Delivery.schema.indexes().find(([keys]) => (
    keys.store === 1 && keys['manualDelivery.idempotencyKey'] === 1
  ));
  assert.equal(options.name, 'manual_delivery_store_idempotency_unique');
  assert.equal(options.unique, true);
  assert.deepEqual(options.partialFilterExpression, {
    sourceType: 'manual',
    'manualDelivery.idempotencyKey': { $type: 'string' }
  });
});

test('date filters use the existing Philippine operating timezone boundaries', () => {
  assert.equal(parseManilaDate('2026-10-16').toISOString(), '2026-10-15T16:00:00.000Z');
  assert.equal(parseManilaDate('2026-10-16', true).toISOString(), '2026-10-16T15:59:59.999Z');
  assert.equal(parseManilaDate('not-a-date'), null);
});

test('summary and list query builder apply the same status, date, and Store scope', async () => {
  const store = id();
  const models = {
    Order: { find: () => ({ distinct: async () => [] }) },
    Booking: { find: () => ({ distinct: async () => [] }) },
    User: { find: () => ({ distinct: async () => [] }) }
  };
  const match = await buildDeliveryQueryFilters({
    query: { status: 'delivered', from: '2026-10-01', to: '2026-10-31' },
    scope: { store, match: { store } }, models,
    escapeRegex: value => value
  });
  assert.equal(match.$and[0].store, store);
  assert.deepEqual(match.$and[1], { status: 'delivered' });
  assert.equal(match.$and[2].createdAt.$gte.toISOString(), '2026-09-30T16:00:00.000Z');
  assert.equal(match.$and[2].createdAt.$lte.toISOString(), '2026-10-31T15:59:59.999Z');
});

test('manual search includes recipient and both persisted addresses', async () => {
  const distinct = async () => [];
  const models = {
    Order: { find: () => ({ distinct }) },
    Booking: { find: () => ({ distinct }) },
    User: { find: () => ({ distinct }) }
  };
  const match = await buildDeliveryQueryFilters({
    query: { search: 'Demo' }, scope: { match: {}, store: null }, models,
    escapeRegex: value => value
  });
  const search = match.$and[1].$or;
  assert.ok(search.some(row => row['manualDelivery.recipientName']));
  assert.ok(search.some(row => row['manualDelivery.pickupAddress.formattedAddress']));
  assert.ok(search.some(row => row['manualDelivery.dropoffAddress.formattedAddress']));
});
