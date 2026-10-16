const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Delivery = require('../models/Delivery');
const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const { assignDelivery, cancelOrderDelivery } = require('../services/deliveryAssignmentService');

const parcelWeightTestUri = process.env.PARCEL_WEIGHT_TRANSACTION_TEST_URI;
const transactionTestUri = parcelWeightTestUri || process.env.MONGODB_TRANSACTION_TEST_URI;
const isolatedTransactionTestUri = transactionTestUri ? (() => {
  const uri = new URL(transactionTestUri);
  const localHost = uri.hostname === '127.0.0.1' || uri.hostname === 'localhost';
  const expectedPort = parcelWeightTestUri ? '27020' : '27018';
  const expectedSet = parcelWeightTestUri ? 'pawzzleParcelWeightRS' : 'pawzzleTestRS';
  if (uri.protocol !== 'mongodb:' || !localHost || uri.port !== expectedPort
    || uri.searchParams.get('replicaSet') !== expectedSet) return null;
  uri.pathname = `/pawzzle_delivery_security_${process.pid}_${Date.now()}`;
  return uri.toString();
})() : null;

test('real MongoDB keeps assignment eligibility, capacity, Delivery, and Order cancellation atomic', {
  skip: !isolatedTransactionTestUri
}, async t => {
  await mongoose.connect(isolatedTransactionTestUri, { autoIndex: false });
  await mongoose.connection.dropDatabase();
  await Promise.all([Delivery.init(), Order.init(), User.init(), Product.init()]);

  t.after(async () => {
    if (mongoose.connection.name.startsWith('pawzzle_delivery_security_')) {
      await mongoose.connection.dropDatabase();
    }
    await mongoose.disconnect();
  });

  const store = new mongoose.Types.ObjectId();
  const customer = new mongoose.Types.ObjectId();
  const actor = new mongoose.Types.ObjectId();
  const rider = new mongoose.Types.ObjectId();
  const item = new mongoose.Types.ObjectId();
  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  await Product.collection.insertOne({
    _id: item,
    name: 'Authoritative weighted fixture', category: 'Pet Accessories',
    description: 'Synthetic transaction fixture', shortDescription: 'Synthetic fixture',
    price: 10, stockQuantity: 10, sku: `WEIGHT-${nonce}`, images: ['/synthetic.jpg'],
    addedBy: actor, store, isActive: true, isDeleted: false,
    weight: 4, weightUnit: 'kg', weightIncludesPackaging: true,
    createdAt: new Date(), updatedAt: new Date()
  });

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
      vehicleType: 'motorcycle',
      vehicleCapacity: { maxWeightKg: 5, maxParcelCount: 5 },
      currentLoad: { weightKg: 0, parcelCount: 0 }
    },
    createdAt: new Date(),
    updatedAt: new Date()
  });

  const makeOrder = (status, productId = item, name = 'Transaction fixture') => Order.create({
    customer,
    addedBy: actor,
    store,
    items: [{ itemType: 'product', itemId: productId, name, price: 10, quantity: 1 }],
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
  const assigned = await assignDelivery({ orderId: valid._id, parcel: { weightKg: 0.001 }, actorId: actor });
  assert.equal(String(assigned.riderId), String(rider));
  assert.equal((await Order.findById(valid._id).lean()).status, 'rider_assigned');
  assert.equal((await User.findById(rider).lean()).riderProfile.currentLoad.weightKg, 4);
  await Product.updateOne({ _id: item }, { $set: { weight: 1 } });
  const idempotentAssignment = await assignDelivery({ orderId: valid._id, parcel: { weightKg: 0.001 }, actorId: actor });
  assert.equal(idempotentAssignment.assignmentChanged, false);
  assert.equal((await Delivery.findOne({ order: valid._id }).lean()).parcel.weightKg, 4);
  await Product.updateOne({ _id: item }, { $set: { weight: 4 } });

  const cancelledResult = await cancelOrderDelivery({ orderId: valid._id, actorId: actor });
  assert.equal(cancelledResult.changed, true);
  assert.equal((await Order.findById(valid._id).lean()).status, 'cancelled');
  assert.equal((await Delivery.findOne({ order: valid._id }).lean()).status, 'cancelled');
  assert.deepEqual((await User.findById(rider).lean()).riderProfile.currentLoad, { weightKg: 0, parcelCount: 0 });

  const repeated = await cancelOrderDelivery({ orderId: valid._id, actorId: actor });
  assert.equal(repeated.changed, false);
  assert.deepEqual((await User.findById(rider).lean()).riderProfile.currentLoad, { weightKg: 0, parcelCount: 0 });

  const missingWeightProduct = new mongoose.Types.ObjectId();
  const heavyProduct = new mongoose.Types.ObjectId();
  await Product.collection.insertMany([{
    _id: missingWeightProduct,
    name: 'Missing weight fixture', category: 'Pet Accessories',
    description: 'Synthetic missing weight fixture', shortDescription: 'Synthetic fixture',
    price: 10, stockQuantity: 10, sku: `MISSING-${nonce}`, images: ['/synthetic.jpg'],
    addedBy: actor, store, isActive: true, isDeleted: false,
    createdAt: new Date(), updatedAt: new Date()
  }, {
    _id: heavyProduct,
    name: 'Over capacity fixture', category: 'Pet Accessories',
    description: 'Synthetic heavy fixture', shortDescription: 'Synthetic fixture',
    price: 10, stockQuantity: 10, sku: `HEAVY-${nonce}`, images: ['/synthetic.jpg'],
    addedBy: actor, store, isActive: true, isDeleted: false,
    weight: 6, weightUnit: 'kg', weightIncludesPackaging: true,
    createdAt: new Date(), updatedAt: new Date()
  }]);

  const missingWeightOrder = await makeOrder('ready_for_pickup', missingWeightProduct, 'Missing weight fixture');
  await assert.rejects(
    assignDelivery({ orderId: missingWeightOrder._id, parcel: { weightKg: 0.001 }, actorId: actor }),
    /Missing product weights must be corrected/
  );
  assert.equal(await Delivery.countDocuments({ order: missingWeightOrder._id }), 0);
  const documentedException = await assignDelivery({
    orderId: missingWeightOrder._id,
    actorId: actor,
    parcel: {
      weightKg: 1.25,
      parcelCount: 1,
      manualException: true,
      confirmed: true,
      manualExceptionReason: 'Measured on the isolated Store packing scale.'
    }
  });
  assert.equal(documentedException.delivery.parcel.measurementSource, 'documented_manual_estimate');
  assert.equal(documentedException.delivery.parcel.weightKg, 1.25);
  await cancelOrderDelivery({ orderId: missingWeightOrder._id, actorId: actor });

  const heavyOrder = await makeOrder('ready_for_pickup', heavyProduct, 'Over capacity fixture');
  await assert.rejects(
    assignDelivery({ orderId: heavyOrder._id, parcel: { weightKg: 0.001 }, actorId: actor }),
    /No configured Rider vehicle can carry this parcel/
  );
  assert.equal(await Delivery.countDocuments({ order: heavyOrder._id }), 0);
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
