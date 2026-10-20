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
      || !/^pawzzle_pet_purchase_test_[a-z0-9]+$/.test(database)) {
    throw new Error('Pet purchase integration requires a fresh loopback pawzzleTestRS test database.');
  }
  return database;
};

test('MongoDB enforces one active purchase and idempotent request key while preserving history', {
  skip: !configuredUri && 'MONGODB_TRANSACTION_TEST_URI is unset; isolated MongoDB integration skipped'
}, async () => {
  const database = requireIsolatedDatabase(configuredUri);
  const client = new mongoose.mongo.MongoClient(configuredUri, { serverSelectionTimeoutMS: 5000 });
  let safeTargetVerified = false;
  try {
    await client.connect();
    const hello = await client.db('admin').command({ hello: 1 });
    assert.equal(hello.setName, 'pawzzleTestRS');
    const databases = await client.db('admin').admin().listDatabases({ nameOnly: true });
    assert.equal(databases.databases.some(entry => entry.name === database), false);
    await mongoose.connect(configuredUri, { serverSelectionTimeoutMS: 5000, autoIndex: false });
    safeTargetVerified = true;

    const AdoptionRequest = require('../models/AdoptionRequest');
    await AdoptionRequest.syncIndexes();
    const id = () => new mongoose.Types.ObjectId();
    const pet = id(); const customer = id(); const seller = id(); const store = id();
    const base = {
      pet, customer, seller, store, conversation: id(), status: 'inquiry_submitted',
      isActivePurchase: true, purchaseFingerprint: 'fingerprint',
      inquiryData: { pickupConfirmation: true }, paymentDetails: { method: 'paymongo' }
    };
    await AdoptionRequest.create({ ...base, purchaseRequestId: 'checkout_request_01' });
    await assert.rejects(
      AdoptionRequest.create({ ...base, _id: undefined, conversation: id(), purchaseRequestId: 'checkout_request_02' }),
      error => error?.code === 11000
    );

    await AdoptionRequest.updateOne({ purchaseRequestId: 'checkout_request_01' }, { $set: { status: 'cancelled', isActivePurchase: false } });
    await AdoptionRequest.create({ ...base, conversation: id(), purchaseRequestId: 'checkout_request_02' });
    await assert.rejects(
      AdoptionRequest.create({ ...base, pet: id(), conversation: id(), purchaseRequestId: 'checkout_request_02' }),
      error => error?.code === 11000
    );
    assert.equal(await AdoptionRequest.countDocuments({ customer }), 2);
  } finally {
    await client.close();
    if (safeTargetVerified && mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
