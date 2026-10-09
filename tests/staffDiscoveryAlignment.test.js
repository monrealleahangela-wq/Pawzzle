const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.JWT_SECRET ||= 'test-only-jwt-secret';

const User = require('../models/User');
const Delivery = require('../models/Delivery');
const Review = require('../models/Review');
const { getEligibleRiders } = require('../controllers/staffController');
const { __test: serviceTest } = require('../controllers/serviceController');
const { buildActiveRiderAccountFilter } = require('../services/deliveryAssignmentService');

const root = path.join(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const response = () => {
  const result = { statusCode: 200, body: null };
  result.status = code => { result.statusCode = code; return result; };
  result.json = body => { result.body = body; return result; };
  return result;
};

test('Rider discovery treats missing legacy lifecycle fields as active without accepting explicit inactive states', () => {
  const filter = buildActiveRiderAccountFilter({ store: 'store-1' });
  assert.equal(filter.store, 'store-1');
  assert.deepEqual(filter.isDeleted, { $ne: true });
  assert.ok(filter.$and.some(clause => clause.$or?.some(row => row.role === 'delivery_rider')));
  assert.ok(filter.$and.some(clause => clause.$or?.some(row => row.isActive?.$exists === false)));
  assert.ok(filter.$and.some(clause => clause.$or?.some(row => row.staffStatus?.$exists === false)));
  assert.ok(filter.$and.some(clause => clause.$or?.some(row => row['riderProfile.accountStatus']?.$exists === false)));
  assert.doesNotMatch(JSON.stringify(filter), /inactive|suspended/);
});

test('authorized Store Rider discovery returns legacy-active accounts for eligibility evaluation', async () => {
  const originals = { find: User.find, deliveryAggregate: Delivery.aggregate, reviewAggregate: Review.aggregate };
  let capturedQuery;
  User.find = query => {
    capturedQuery = query;
    const chain = {
      select: () => chain,
      populate: () => chain,
      lean: async () => [{
        _id: 'rider-1', role: 'delivery_rider', store: 'store-1',
        professionalProfile: { availability: {} },
        riderProfile: {
          vehicleType: 'motorcycle',
          vehicleCapacity: { maxWeightKg: 20, maxParcelCount: 4 },
          currentLoad: { weightKg: 0, parcelCount: 0 }
        }
      }]
    };
    return chain;
  };
  Delivery.aggregate = async () => [];
  Review.aggregate = async () => [];
  try {
    const res = response();
    await getEligibleRiders({
      user: { _id: 'owner-1', role: 'store_owner', store: 'store-1' },
      query: { weightKg: '2', parcelCount: '1' }
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.riders.length, 1);
    assert.equal(res.body.riders[0].eligibility.eligible, true);
    assert.equal(res.body.assignmentReadiness.eligibleCount, 1);
    assert.deepEqual(capturedQuery.store, { $in: ['store-1'] });
  } finally {
    User.find = originals.find;
    Delivery.aggregate = originals.deliveryAggregate;
    Review.aggregate = originals.reviewAggregate;
  }
});

test('Service staff validation accepts a same-Store active direct-role Veterinarian and preserves qualification', async () => {
  const originalFind = User.find;
  const veterinarian = { _id: 'vet-1', firstName: 'Ana', lastName: 'Reyes', role: 'veterinarian', store: 'store-1' };
  let capturedQuery;
  User.find = async query => { capturedQuery = query; return [veterinarian]; };
  try {
    const ids = await serviceTest.validateAssignedStaff(['vet-1'], 'store-1', { category: 'health_wellness', name: 'Consultation' });
    assert.deepEqual(ids, ['vet-1']);
    assert.equal(capturedQuery.store, 'store-1');
    assert.ok(capturedQuery.$or.some(row => row.role?.$in?.includes('veterinarian')));
    assert.deepEqual(capturedQuery.isActive, { $ne: false });
    assert.deepEqual(capturedQuery.isDeleted, { $ne: true });

    await assert.rejects(
      serviceTest.validateAssignedStaff(['vet-1'], 'store-1', { category: 'grooming', name: 'Bath' }),
      /not eligible for this service/i
    );
  } finally {
    User.find = originalFind;
  }
});

test('discovery UIs distinguish API errors and preserve automatic Rider assignment', () => {
  const services = source('client/src/pages/admin/ServiceManagement.js');
  const bookings = source('client/src/pages/admin/BookingsManagement.js');
  assert.match(services, /staffError/);
  assert.match(services, /role="alert"/);
  assert.match(bookings, /setAssignmentReadiness\(\{ message:/);
  assert.match(bookings, /assignmentReadiness=\{assignmentReadiness\}/);
  assert.match(bookings, /Assign Rider Automatically|Reassign Automatically/);
  assert.doesNotMatch(bookings, /selectedRiderId|riderId:\s*selected/);
});
