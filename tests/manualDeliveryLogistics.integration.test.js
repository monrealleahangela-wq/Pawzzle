const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Delivery = require('../models/Delivery');
const Store = require('../models/Store');
const User = require('../models/User');
const { assignDelivery } = require('../services/deliveryAssignmentService');
const {
  createManualDelivery,
  updateManualDelivery,
  getDeliveries,
  getLogisticsDashboard
} = require('../controllers/logisticsController');

const configuredUri = process.env.MONGODB_TRANSACTION_TEST_URI;
const isolatedLocalUri = configuredUri ? (() => {
  const uri = new URL(configuredUri);
  const localHost = uri.hostname === '127.0.0.1' || uri.hostname === 'localhost';
  if (uri.protocol !== 'mongodb:' || !localHost || uri.port !== '27018'
    || uri.searchParams.get('replicaSet') !== 'pawzzleTestRS') return null;
  uri.pathname = `/pawzzle_manual_delivery_test_${process.pid}_${Date.now()}`;
  return uri.toString();
})() : null;

const responseCapture = () => {
  const capture = { statusCode: 200, body: undefined };
  capture.status = code => { capture.statusCode = code; return capture; };
  capture.json = body => { capture.body = body; return capture; };
  return capture;
};

const socket = { to: () => ({ emit: () => undefined }) };
const request = ({ store, actor, body = {}, params = {}, query = {} }) => ({
  user: { _id: actor, role: 'store_owner', store }, body, params, query,
  app: { get: name => name === 'socketio' ? socket : undefined }
});
const manualBody = idempotencyKey => ({
  recipientName: 'Synthetic Recipient', recipientPhone: '09170000000', idempotencyKey,
  pickupAddress: {
    formattedAddress: 'Synthetic Store Pickup, Imus, Cavite', placeId: 'pickup-place',
    coordinates: { lat: 14.4297, lng: 120.9367 }
  },
  dropoffAddress: {
    formattedAddress: 'Synthetic Customer Address, Bacoor, Cavite', placeId: 'dropoff-place',
    coordinates: { lat: 14.4129, lng: 120.9701 }
  }
});
test('real MongoDB keeps manual creation idempotent and summary/list totals authoritative', {
  skip: !isolatedLocalUri
}, async () => {
  await mongoose.connect(isolatedLocalUri, { serverSelectionTimeoutMS: 5000 });
  try {
    await mongoose.connection.dropDatabase();
    await Delivery.syncIndexes();
    const store = new mongoose.Types.ObjectId();
    const otherStore = new mongoose.Types.ObjectId();
    const actor = new mongoose.Types.ObjectId();

    const emptyDashboard = responseCapture();
    await getLogisticsDashboard(request({ store, actor }), emptyDashboard);
    assert.equal(emptyDashboard.statusCode, 200);
    assert.deepEqual(emptyDashboard.body.summary, {
      total: 0,
      pendingAssignment: 0,
      assigned: 0,
      outForDelivery: 0,
      arrived: 0,
      delivered: 0,
      failed: 0,
      cancelled: 0,
      activeInternalRiders: 0
    });

    const attempts = await Promise.all(Array.from({ length: 2 }, async () => {
      const res = responseCapture();
      await createManualDelivery(request({ store, actor, body: manualBody('same-safe-request') }), res);
      return res;
    }));
    assert.deepEqual(attempts.map(item => item.statusCode).sort(), [200, 201]);
    assert.equal(await Delivery.countDocuments({ store, sourceType: 'manual' }), 1);

    const manual = await Delivery.findOne({ store, sourceType: 'manual' });
    const update = responseCapture();
    await updateManualDelivery(request({
      store, actor, params: { id: String(manual._id) }, body: {
        ...manualBody('ignored-update-key'),
        dropoffAddress: { formattedAddress: 'Typed replacement with no selected map suggestion' }
      }
    }), update);
    assert.equal(update.statusCode, 200);
    const changed = await Delivery.findById(manual._id).lean();
    assert.equal(changed.manualDelivery.dropoffAddress.formattedAddress, 'Typed replacement with no selected map suggestion');
    assert.equal(changed.manualDelivery.dropoffAddress.coordinates, undefined);
    assert.equal(changed.manualDelivery.dropoffAddress.placeId, undefined);

    const rider = new mongoose.Types.ObjectId();
    const now = new Date();
    await Store.collection.insertOne({
      _id: store, owner: actor, name: 'Synthetic Manual Delivery Store',
      hrSettings: { timezone: 'Asia/Manila' }, createdAt: now, updatedAt: now
    });
    await User.collection.insertOne({
      _id: rider, username: `manual-rider-${rider}`, email: `${rider}@example.test`, password: 'test-only',
      firstName: 'Synthetic', lastName: 'Rider', role: 'delivery_rider', store,
      isActive: true, isDeleted: false, staffStatus: 'active',
      riderProfile: {
        accountStatus: 'active', vehicleType: 'motorcycle',
        vehicleCapacity: { maxWeightKg: 20, maxParcelCount: 10 },
        currentLoad: { weightKg: 0, parcelCount: 0 }
      },
      professionalProfile: { availability: {} }, createdAt: now, updatedAt: now
    });
    const assignment = await assignDelivery({
      deliveryId: manual._id, parcel: { weightKg: 1.25, parcelCount: 1 }, actorId: actor
    });
    assert.equal(String(assignment.riderId), String(rider));
    assert.equal((await Delivery.findById(manual._id).lean()).status, 'assigned');

    await Delivery.create([
      { store, order: new mongoose.Types.ObjectId(), booking: new mongoose.Types.ObjectId(), status: 'delivered', assignedRider: new mongoose.Types.ObjectId(), assignmentType: 'internal' },
      { store, order: new mongoose.Types.ObjectId(), status: 'in_transit', assignedRider: new mongoose.Types.ObjectId(), assignmentType: 'internal' },
      { store: otherStore, order: new mongoose.Types.ObjectId(), status: 'cancelled' }
    ]);

    const dashboard = responseCapture();
    await getLogisticsDashboard(request({ store, actor }), dashboard);
    assert.equal(dashboard.statusCode, 200);
    assert.equal(dashboard.body.summary.total, 3);
    assert.equal(dashboard.body.summary.pendingAssignment, 0);
    assert.equal(dashboard.body.summary.assigned, 1);
    assert.equal(dashboard.body.summary.delivered, 1);
    assert.equal(dashboard.body.summary.outForDelivery, 1);

    const filteredDashboard = responseCapture();
    await getLogisticsDashboard(request({ store, actor, query: { status: 'delivered' } }), filteredDashboard);
    assert.equal(filteredDashboard.body.summary.total, 1);
    assert.equal(filteredDashboard.body.summary.delivered, 1);

    const page = responseCapture();
    await getDeliveries(request({ store, actor, query: { page: '1', limit: '1' } }), page);
    assert.equal(page.statusCode, 200);
    assert.equal(page.body.deliveries.length, 1);
    assert.equal(page.body.pagination.total, 3);
    assert.equal(page.body.pagination.pages, 3);

    const isolated = responseCapture();
    await getLogisticsDashboard(request({ store: otherStore, actor }), isolated);
    assert.equal(isolated.body.summary.total, 1);
    assert.equal(isolated.body.summary.cancelled, 1);
  } finally {
    if (mongoose.connection.name.startsWith('pawzzle_manual_delivery_test_')) {
      await mongoose.connection.dropDatabase();
    }
    await mongoose.disconnect();
  }
});
