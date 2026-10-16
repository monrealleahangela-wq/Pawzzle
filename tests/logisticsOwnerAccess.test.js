const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Store = require('../models/Store');
const Order = require('../models/Order');
const Booking = require('../models/Booking');
const Delivery = require('../models/Delivery');
const RiderEarning = require('../models/RiderEarning');
const { getDeliveryDetails } = require('../controllers/logisticsController');
const { getEligibleRiders } = require('../controllers/staffController');

const queryResult = value => ({
  populate() { return this; },
  select() { return this; },
  lean() { return Promise.resolve(value); },
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); }
});

const response = () => ({
  statusCode: 200,
  body: undefined,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }
});

const makeDelivery = (deliveryId, storeId) => {
  const raw = {
    _id: deliveryId, store: storeId, sourceType: 'manual', status: 'pending',
    assignedRider: null, statusHistory: [], assignmentHistory: [], trackingToken: 'private-token',
    manualDelivery: { recipientName: 'Synthetic recipient' }
  };
  return { ...raw, toObject: () => ({ ...raw }) };
};

test('Logistics detail keeps Store-owner and Manager scope while denying cross-Store access', async t => {
  const originals = {
    storeFindOne: Store.findOne,
    orderFind: Order.find,
    bookingFind: Booking.find,
    deliveryFindOne: Delivery.findOne,
    earningFindOne: RiderEarning.findOne
  };
  const ownerId = new mongoose.Types.ObjectId();
  const ownStoreId = new mongoose.Types.ObjectId();
  const otherStoreId = new mongoose.Types.ObjectId();
  const deliveryId = new mongoose.Types.ObjectId();
  let capturedFilter;
  let deliveryResult = makeDelivery(deliveryId, ownStoreId);

  Store.findOne = () => ({ select: () => ({ lean: async () => ({ _id: ownStoreId }) }) });
  Order.find = () => ({ distinct: async () => [] });
  Booking.find = () => ({ distinct: async () => [] });
  Delivery.findOne = filter => { capturedFilter = filter; return queryResult(deliveryResult); };
  RiderEarning.findOne = () => queryResult(null);

  try {
    await t.test('Store owner can open a Delivery belonging to the Store they own even without user.store', async () => {
      const res = response();
      await getDeliveryDetails({ user: { _id: ownerId, role: 'store_owner' }, params: { id: String(deliveryId) } }, res);
      assert.equal(res.statusCode, 200);
      assert.equal(String(res.body.delivery._id), String(deliveryId));
      assert.match(JSON.stringify(capturedFilter), new RegExp(String(ownStoreId)));
    });

    await t.test('authorized Manager can open a Delivery in their assigned Store', async () => {
      const res = response();
      await getDeliveryDetails({ user: { _id: new mongoose.Types.ObjectId(), role: 'manager', store: ownStoreId }, params: { id: String(deliveryId) } }, res);
      assert.equal(res.statusCode, 200);
      assert.equal(String(res.body.delivery.store), String(ownStoreId));
    });

    await t.test('another Store receives not found without learning whether the Delivery exists', async () => {
      deliveryResult = null;
      const res = response();
      await getDeliveryDetails({ user: { _id: new mongoose.Types.ObjectId(), role: 'manager', store: otherStoreId }, params: { id: String(deliveryId) } }, res);
      assert.equal(res.statusCode, 404);
      assert.equal(res.body.message, 'Delivery not found.');
      assert.match(JSON.stringify(capturedFilter), new RegExp(String(otherStoreId)));
      assert.doesNotMatch(JSON.stringify(capturedFilter), new RegExp(String(ownStoreId)));
    });

    await t.test('invalid Delivery ids receive a safe not-found response', async () => {
      Delivery.findOne = () => { const error = new Error('Cast failed'); error.name = 'CastError'; throw error; };
      const res = response();
      await getDeliveryDetails({ user: { _id: ownerId, role: 'store_owner', store: ownStoreId }, params: { id: 'invalid-id' } }, res);
      assert.equal(res.statusCode, 404);
      assert.equal(res.body.message, 'Delivery not found.');
    });
  } finally {
    Store.findOne = originals.storeFindOne;
    Order.find = originals.orderFind;
    Booking.find = originals.bookingFind;
    Delivery.findOne = originals.deliveryFindOne;
    RiderEarning.findOne = originals.earningFindOne;
  }
});

test('Rider eligibility rejects object-shaped Store parameters instead of misclassifying ownership', async () => {
  const res = response();
  await getEligibleRiders({
    user: { _id: new mongoose.Types.ObjectId(), role: 'store_owner' },
    query: { storeId: { _id: String(new mongoose.Types.ObjectId()) } }
  }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'A valid Store identifier is required for Rider eligibility.');
});
