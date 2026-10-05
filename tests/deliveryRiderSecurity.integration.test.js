const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Delivery = require('../models/Delivery');
const Order = require('../models/Order');
const User = require('../models/User');
const { assignDelivery, cancelOrderDelivery } = require('../services/deliveryAssignmentService');

const transactionTestUri = process.env.MONGODB_TRANSACTION_TEST_URI;
const isolatedTransactionTestUri = transactionTestUri ? (() => {
  const uri = new URL(transactionTestUri);
  const baseDatabase = uri.pathname.replace(/^\//, '') || 'pawzzle_transaction_test';
  uri.pathname = `/${baseDatabase}_delivery_security_${process.pid}`;
  return uri.toString();
})() : null;

test('real MongoDB keeps assignment eligibility, capacity, Delivery, and Order cancellation atomic', {
  skip: !transactionTestUri
}, async t => {
  await mongoose.connect(isolatedTransactionTestUri, { autoIndex: false });
  await mongoose.connection.dropDatabase();
  await Promise.all([Delivery.init(), Order.init(), User.init()]);

  t.after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  const store = new mongoose.Types.ObjectId();
  const customer = new mongoose.Types.ObjectId();
  const actor = new mongoose.Types.ObjectId();
  const rider = new mongoose.Types.ObjectId();
  const item = new mongoose.Types.ObjectId();
  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  await User.collection.insertOne({
    _id: rider,
    username: `rider-${nonce}`,
    email: `rider-${nonce}@example.test`,
    password: 'test-only-not-a-live-credential',
    firstName: 'Transaction',
    lastName: 'Rider',
    role: 'delivery_rider',
    store,
    isActive: true,
    isDeleted: false,
    staffStatus: 'active',
    professionalProfile: { availability: {} },
    riderProfile: {
      accountStatus: 'active',
      vehicleCapacity: { maxWeightKg: 5, maxParcelCount: 5 },
      currentLoad: { weightKg: 0, parcelCount: 0 }
    },
    createdAt: new Date(),
    updatedAt: new Date()
  });

  const makeOrder = status => Order.create({
    customer,
    addedBy: actor,
    store,
    items: [{ itemType: 'product', itemId: item, name: 'Transaction fixture', price: 10, quantity: 1 }],
    totalAmount: 10,
    deliveryMethod: 'delivery',
    phoneNumber: '09170000000',
    paymentMethod: 'paymongo',
    paymentStatus: 'pending',
    status
  });

  const cancelled = await makeOrder('cancelled');
  await assert.rejects(
    assignDelivery({ orderId: cancelled._id, parcel: { weightKg: 2 }, actorId: actor }),
    /not eligible/
  );
  assert.equal(await Delivery.countDocuments({ order: cancelled._id }), 0);
  assert.deepEqual((await User.findById(rider).lean()).riderProfile.currentLoad, { weightKg: 0, parcelCount: 0 });

  const valid = await makeOrder('ready_for_pickup');
  const assigned = await assignDelivery({ orderId: valid._id, parcel: { weightKg: 5 }, actorId: actor });
  assert.equal(String(assigned.riderId), String(rider));
  assert.equal((await Order.findById(valid._id).lean()).status, 'rider_assigned');
  assert.equal((await User.findById(rider).lean()).riderProfile.currentLoad.weightKg, 5);

  const cancelledResult = await cancelOrderDelivery({ orderId: valid._id, actorId: actor });
  assert.equal(cancelledResult.changed, true);
  assert.equal((await Order.findById(valid._id).lean()).status, 'cancelled');
  assert.equal((await Delivery.findOne({ order: valid._id }).lean()).status, 'cancelled');
  assert.deepEqual((await User.findById(rider).lean()).riderProfile.currentLoad, { weightKg: 0, parcelCount: 0 });

  const repeated = await cancelOrderDelivery({ orderId: valid._id, actorId: actor });
  assert.equal(repeated.changed, false);
  assert.deepEqual((await User.findById(rider).lean()).riderProfile.currentLoad, { weightKg: 0, parcelCount: 0 });

  const first = await makeOrder('ready_for_pickup');
  const second = await makeOrder('ready_for_pickup');
  const concurrent = await Promise.allSettled([
    assignDelivery({ orderId: first._id, parcel: { weightKg: 4 }, actorId: actor }),
    assignDelivery({ orderId: second._id, parcel: { weightKg: 4 }, actorId: actor })
  ]);
  assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(concurrent.filter(result => result.status === 'rejected').length, 1);
  assert.equal((await User.findById(rider).lean()).riderProfile.currentLoad.weightKg, 4);
  assert.equal(await Delivery.countDocuments({ order: { $in: [first._id, second._id] } }), 1);

  const replacementRider = new mongoose.Types.ObjectId();
  await User.collection.insertOne({
    _id: replacementRider,
    username: `replacement-${nonce}`,
    email: `replacement-${nonce}@example.test`,
    password: 'test-only-not-a-live-credential',
    firstName: 'Replacement',
    lastName: 'Rider',
    role: 'delivery_rider',
    store,
    isActive: true,
    isDeleted: false,
    staffStatus: 'active',
    professionalProfile: { availability: {} },
    riderProfile: {
      accountStatus: 'active',
      vehicleType: 'motorcycle',
      vehicleCapacity: { maxWeightKg: 5, maxParcelCount: 5 },
      currentLoad: { weightKg: 0, parcelCount: 0 }
    },
    createdAt: new Date(),
    updatedAt: new Date()
  });
  const assignedOrderId = concurrent.find(result => result.status === 'fulfilled').value.sourceId;
  const reassigned = await assignDelivery({
    orderId: assignedOrderId,
    parcel: { weightKg: 4 },
    actorId: actor,
    reassign: true
  });
  assert.equal(String(reassigned.previousRiderId), String(rider));
  assert.equal(String(reassigned.riderId), String(replacementRider));
  assert.deepEqual((await User.findById(rider).lean()).riderProfile.currentLoad, { weightKg: 0, parcelCount: 0 });
  assert.deepEqual((await User.findById(replacementRider).lean()).riderProfile.currentLoad, { weightKg: 4, parcelCount: 1 });
});
