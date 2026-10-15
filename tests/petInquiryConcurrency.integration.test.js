const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const configuredUri = process.env.MONGODB_TRANSACTION_TEST_URI;

const requireIsolatedDatabase = uri => {
  const parsed = new URL(uri);
  const database = parsed.pathname.slice(1);
  if (parsed.hostname !== '127.0.0.1' || parsed.port !== '27018'
      || parsed.username || parsed.password
      || parsed.searchParams.get('replicaSet') !== 'pawzzleTestRS'
      || !/^pawzzle_pet_inquiry_test_[a-z0-9]+$/.test(database)) {
    throw new Error('Pet inquiry integration requires a fresh loopback pawzzleTestRS test database.');
  }
  return database;
};

const invoke = async (handler, req) => {
  const response = { statusCode: 200, body: null };
  const res = {
    status(value) { response.statusCode = value; return this; },
    json(value) { response.body = value; return this; }
  };
  await handler(req, res);
  return response;
};

test('persisted pet inquiry concurrency, authorization, history, and notifications', {
  skip: !configuredUri && 'MONGODB_TRANSACTION_TEST_URI is unset; isolated MongoDB integration skipped'
}, async t => {
  const database = requireIsolatedDatabase(configuredUri);
  const client = new mongoose.mongo.MongoClient(configuredUri, { serverSelectionTimeoutMS: 5000 });
  let safeTargetVerified = false;
  try {
    await client.connect();
    const hello = await client.db('admin').command({ hello: 1 });
    assert.equal(hello.setName, 'pawzzleTestRS');
    assert.equal(hello.isWritablePrimary, true);
    assert.equal(hello.me, '127.0.0.1:27018');
    const databases = await client.db('admin').admin().listDatabases({ nameOnly: true });
    assert.equal(databases.databases.some(entry => entry.name === database), false,
      'test database must be new before any writes or cleanup');
    await mongoose.connect(configuredUri, { serverSelectionTimeoutMS: 5000, autoIndex: false });
    safeTargetVerified = true;

    const User = require('../models/User');
    const Store = require('../models/Store');
    const Pet = require('../models/Pet');
    const PetInquiry = require('../models/PetInquiry');
    const Notification = require('../models/Notification');
    const controller = require('../controllers/petInquiryController');
    await Promise.all([PetInquiry, Notification].map(model => model.syncIndexes()));
    const indexes = await PetInquiry.collection.indexes();
    assert.ok(indexes.some(index => index.unique && index.key.customer === 1 && index.key.submissionKey === 1));

    const id = () => new mongoose.Types.ObjectId();
    const ownerId = id(); const otherOwnerId = id();
    const customerId = id(); const otherCustomerId = id();
    const storeId = id(); const otherStoreId = id(); const petId = id();
    const customer = { _id: customerId, role: 'customer' };
    const otherCustomer = { _id: otherCustomerId, role: 'customer' };
    const seller = { _id: ownerId, role: 'store_owner', store: storeId };
    const otherSeller = { _id: otherOwnerId, role: 'store_owner', store: otherStoreId };
    await User.collection.insertMany([
      { _id: ownerId, username: `owner-${ownerId}`, email: `owner-${ownerId}@test.invalid`, role: 'store_owner', store: storeId, isActive: true, isDeleted: false },
      { _id: otherOwnerId, username: `owner-${otherOwnerId}`, email: `owner-${otherOwnerId}@test.invalid`, role: 'store_owner', store: otherStoreId, isActive: true, isDeleted: false },
      { _id: customerId, username: `customer-${customerId}`, email: `customer-${customerId}@test.invalid`, role: 'customer', isActive: true, isDeleted: false },
      { _id: otherCustomerId, username: `customer-${otherCustomerId}`, email: `customer-${otherCustomerId}@test.invalid`, role: 'customer', isActive: true, isDeleted: false }
    ]);
    await Store.collection.insertMany([
      { _id: storeId, owner: ownerId, name: 'Synthetic Pet Store', slug: `synthetic-${storeId}`, isActive: true, isDeleted: false, verificationStatus: 'verified', operationalModules: ['pets'] },
      { _id: otherStoreId, owner: otherOwnerId, name: 'Other Synthetic Store', slug: `other-${otherStoreId}`, isActive: true, isDeleted: false, verificationStatus: 'verified', operationalModules: ['pets'] }
    ]);
    await Pet.collection.insertOne({ _id: petId, name: 'Synthetic Pet', store: storeId, status: 'available', isAvailable: true, isDeleted: false, listingType: 'sale', quantity: 1, images: [] });

    let inquiryId;
    await t.test('duplicate concurrent submissions persist one inquiry and one owner notification', async () => {
      const req = { user: customer, body: { petId: String(petId), subject: 'Synthetic question', question: 'What is the pet care routine?', requestKey: 'submit_once_01' } };
      const results = await Promise.all([invoke(controller.create, req), invoke(controller.create, req)]);
      assert.deepEqual(results.map(result => result.statusCode).sort(), [200, 201]);
      inquiryId = results[0].body.inquiry._id;
      assert.equal(await PetInquiry.countDocuments({ customer: customerId }), 1);
      assert.equal(await Notification.countDocuments({ relatedId: inquiryId, recipient: ownerId }), 1);
      assert.equal(await Notification.countDocuments({ relatedId: inquiryId, recipient: otherOwnerId }), 0);
    });

    await t.test('customer and Store scope are enforced on reads and actions', async () => {
      assert.equal((await invoke(controller.getOne, { user: customer, params: { id: String(inquiryId) } })).statusCode, 200);
      assert.equal((await invoke(controller.getOne, { user: otherCustomer, params: { id: String(inquiryId) } })).statusCode, 404);
      assert.equal((await invoke(controller.getOne, { user: otherSeller, params: { id: String(inquiryId) } })).statusCode, 404);
      assert.equal((await invoke(controller.act, { user: otherSeller, params: { id: String(inquiryId) }, body: { action: 'seller_reply', body: 'Unauthorized reply', requestKey: 'wrong_store_01' } })).statusCode, 404);
      assert.equal((await invoke(controller.act, { user: otherCustomer, params: { id: String(inquiryId) }, body: { action: 'customer_follow_up', body: 'Unauthorized follow-up', requestKey: 'wrong_customer_01' } })).statusCode, 404);
      const otherCustomerList = await invoke(controller.list, { user: otherCustomer, query: {} });
      assert.equal(otherCustomerList.body.inquiries.length, 0);
      const otherSellerList = await invoke(controller.list, { user: otherSeller, query: {} });
      assert.equal(otherSellerList.body.inquiries.length, 0);
    });

    await t.test('concurrent customer follow-ups are preserved and replay is idempotent', async () => {
      const request = key => ({ user: customer, params: { id: String(inquiryId) }, body: { action: 'customer_follow_up', body: `Follow-up ${key}`, requestKey: key } });
      const results = await Promise.all([
        invoke(controller.act, request('follow_up_01')),
        invoke(controller.act, request('follow_up_02'))
      ]);
      assert.deepEqual(results.map(result => result.statusCode), [200, 200]);
      const stored = await PetInquiry.findById(inquiryId).lean();
      assert.equal(stored.events.length, 3);
      assert.deepEqual(new Set(stored.events.slice(1).map(event => event.requestKey)), new Set(['follow_up_01', 'follow_up_02']));
      const replay = await invoke(controller.act, request('follow_up_01'));
      assert.equal(replay.statusCode, 200);
      assert.equal(replay.body.replayed, true);
      assert.equal((await PetInquiry.findById(inquiryId).lean()).events.length, 3);
      assert.equal(await Notification.countDocuments({ relatedId: inquiryId, recipient: ownerId }), 3);
    });

    await t.test('seller reply and customer follow-up retain ordered activity and final state', async () => {
      const reply = { user: seller, params: { id: String(inquiryId) }, body: { action: 'seller_reply', body: 'Seller care guidance', requestKey: 'seller_reply_01' } };
      const followUp = { user: customer, params: { id: String(inquiryId) }, body: { action: 'customer_follow_up', body: 'Customer asks again', requestKey: 'follow_up_03' } };
      const results = await Promise.all([invoke(controller.act, reply), invoke(controller.act, followUp)]);
      assert.deepEqual(results.map(result => result.statusCode), [200, 200]);
      const stored = await PetInquiry.findById(inquiryId).lean();
      assert.equal(stored.events.length, 5);
      assert.deepEqual(new Set(stored.events.slice(3).map(event => event.requestKey)), new Set(['seller_reply_01', 'follow_up_03']));
      assert.equal(stored.status, stored.events.at(-1).status);
      assert.ok(stored.events.every(event => event._id && event.createdAt instanceof Date));
      assert.equal(stored.lastActivityAt.getTime(), stored.events.at(-1).createdAt.getTime());
      for (let index = 1; index < stored.events.length; index += 1) {
        assert.ok(stored.events[index].createdAt >= stored.events[index - 1].createdAt, 'activity timestamps follow persisted event order');
      }
      assert.equal(await Notification.countDocuments({ relatedId: inquiryId, recipient: customerId }), 1);
    });

    await t.test('conflicting terminal transitions allow only one result and scoped notification', async () => {
      const results = await Promise.all([
        invoke(controller.act, { user: seller, params: { id: String(inquiryId) }, body: { action: 'resolved', requestKey: 'resolved_01' } }),
        invoke(controller.act, { user: customer, params: { id: String(inquiryId) }, body: { action: 'cancelled', requestKey: 'cancelled_01' } })
      ]);
      assert.deepEqual(results.map(result => result.statusCode).sort(), [200, 409]);
      const stored = await PetInquiry.findById(inquiryId).lean();
      assert.equal(stored.events.length, 6);
      assert.equal(stored.status, stored.events.at(-1).status);
      assert.ok(['resolved', 'cancelled'].includes(stored.status));
      const notifications = await Notification.find({ relatedId: inquiryId }).lean();
      assert.equal(notifications.length, 6);
      assert.ok(notifications.every(item => [String(ownerId), String(customerId)].includes(String(item.recipient))));
      assert.equal(await Notification.countDocuments({ relatedId: inquiryId, recipient: otherOwnerId }), 0);
      assert.equal(await Notification.countDocuments({ relatedId: inquiryId, recipient: otherCustomerId }), 0);
    });

    await t.test('delayed concurrent write cannot backdate later activity', async () => {
      const created = await invoke(controller.create, {
        user: customer,
        body: { petId: String(petId), subject: 'Ordering question', question: 'How does this pet settle in?', requestKey: 'submit_order_02' }
      });
      assert.equal(created.statusCode, 201);
      const secondId = String(created.body.inquiry._id);
      const originalUpdate = PetInquiry.findOneAndUpdate;
      let releaseDelayed;
      let signalEntered;
      const entered = new Promise(resolve => { signalEntered = resolve; });
      const gate = new Promise(resolve => { releaseDelayed = resolve; });
      PetInquiry.findOneAndUpdate = function (filter, update, options) {
        const appended = update[0]?.$set?.events?.$concatArrays?.[1]?.[0]?.$mergeObjects?.[0]?.$literal;
        if (appended?.requestKey === 'delayed_reply_02') {
          signalEntered();
          return gate.then(() => originalUpdate.call(this, filter, update, options));
        }
        return originalUpdate.call(this, filter, update, options);
      };
      try {
        const delayed = invoke(controller.act, {
          user: seller, params: { id: secondId },
          body: { action: 'seller_reply', body: 'Delayed seller response', requestKey: 'delayed_reply_02' }
        });
        await entered;
        const firstCommitted = await invoke(controller.act, {
          user: customer, params: { id: secondId },
          body: { action: 'customer_follow_up', body: 'First committed follow-up', requestKey: 'first_commit_02' }
        });
        assert.equal(firstCommitted.statusCode, 200);
        releaseDelayed();
        const secondCommitted = await delayed;
        assert.equal(secondCommitted.statusCode, 200);
        const stored = await PetInquiry.findById(secondId).lean();
        assert.deepEqual(stored.events.map(event => event.requestKey), ['submit_order_02', 'first_commit_02', 'delayed_reply_02']);
        assert.ok(stored.events[2].createdAt >= stored.events[1].createdAt,
          'timestamps must follow persisted activity order even if requests finish out of order');
        assert.equal(stored.status, stored.events.at(-1).status);
        assert.equal(stored.lastActivityAt.getTime(), stored.events.at(-1).createdAt.getTime());
      } finally {
        releaseDelayed();
        PetInquiry.findOneAndUpdate = originalUpdate;
      }
    });
  } finally {
    await client.close();
    if (safeTargetVerified && mongoose.connection.readyState === 1) {
      await mongoose.connection.dropDatabase();
    }
    await mongoose.disconnect();
  }
});
