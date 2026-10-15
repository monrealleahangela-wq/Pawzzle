const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Pet = require('../models/Pet');
const Store = require('../models/Store');
const User = require('../models/User');
const Notification = require('../models/Notification');
const PetInquiry = require('../models/PetInquiry');
const controller = require('../controllers/petInquiryController');
const { cleanText, validateAction, validateRequestKey } = require('../utils/petInquiryPolicy');

const petId = '507f1f77bcf86cd799439011';
const storeId = '507f1f77bcf86cd799439012';
const customerId = '507f1f77bcf86cd799439013';
const ownerId = '507f1f77bcf86cd799439014';
const inquiryId = '507f1f77bcf86cd799439015';
const otherStoreId = '507f1f77bcf86cd799439016';
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const customer = { _id: customerId, role: 'customer' };
const seller = { _id: ownerId, role: 'manager', store: storeId };
const inquiry = (status = 'submitted') => ({
  _id: inquiryId, pet: petId, customer: customerId, store: storeId,
  petSnapshot: { name: 'Milo' }, subject: 'Milo care', question: 'What food does Milo eat?',
  status, events: [{ requestKey: 'initial01', kind: 'submitted', status: 'submitted' }]
});
const withMocks = async (mocks, callback) => {
  const originals = mocks.map(([object, key]) => [object, key, object[key]]);
  mocks.forEach(([object, key, replacement]) => { object[key] = replacement; });
  try { await callback(); } finally { originals.forEach(([object, key, value]) => { object[key] = value; }); }
};

test('text, request keys, and back-and-forth transitions are validated', () => {
  assert.equal(cleanText('  <b>Hello</b>  ', 3, 160, 'Subject'), 'Hello');
  assert.throws(() => cleanText('x', 3, 160, 'Subject'), /3/);
  assert.throws(() => validateRequestKey('bad'), /request key/);
  assert.equal(validateAction('seller_reply', 'seller', 'submitted').to, 'seller_responded');
  assert.equal(validateAction('customer_follow_up', 'customer', 'seller_responded').to, 'awaiting_seller_response');
  assert.equal(validateAction('seller_reply', 'seller', 'additional_information_required').to, 'seller_responded');
  assert.throws(() => validateAction('seller_reply', 'customer', 'submitted'), /not permitted/);
  assert.throws(() => validateAction('seller_reply', 'seller', 'resolved'), /no longer open/);
});

test('model has unique customer submission keys and stable Store-scoped indexes', () => {
  const indexes = PetInquiry.schema.indexes();
  assert(indexes.some(([fields, options]) => fields.customer === 1 && fields.submissionKey === 1 && options.unique));
  assert(indexes.some(([fields]) => fields.store === 1 && fields.lastActivityAt === -1));
  assert(PetInquiry.schema.path('events').schema.path('createdAt').isRequired);
});

test('customer submits an eligible legacy marketplace pet and seller gets a scoped notification', async () => {
  const notices = [];
  let created;
  await withMocks([
    [PetInquiry, 'findOne', async () => null],
    [PetInquiry, 'create', async data => { created = data; return { ...data, _id: inquiryId }; }],
    [Pet, 'findById', async () => ({ _id: petId, store: storeId, name: 'Milo', images: [], status: 'available', isAvailable: true, quantity: 1 })],
    [User, 'find', () => ({ distinct: async () => [ownerId] })],
    [Store, 'findOne', () => ({ select: async () => ({ _id: storeId, owner: ownerId }) })],
    [Store, 'findById', () => ({ select: () => ({ lean: async () => ({ owner: ownerId }) }) })],
    [Notification.prototype, 'save', async function () { notices.push(this.toObject()); return this; }]
  ], async () => {
    const res = response();
    await controller.create({ user: customer, body: { petId, subject: 'Milo care', question: 'What food does Milo eat?', requestKey: 'submit-key-01' } }, res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.inquiry.submissionKey, undefined);
    assert.equal(res.body.inquiry.events[0].requestKey, undefined);
    assert.equal(created.store, storeId);
    assert.equal(created.events[0].body, created.question);
    assert.equal(notices.length, 1);
    assert.equal(String(notices[0].recipient), ownerId);
    assert.equal(notices[0].targetUrl, `/admin/pet-inquiries?id=${inquiryId}`);
    assert.equal(notices[0].relatedModel, 'PetInquiry');
  });
});

test('unavailable pets are rejected and same submission key replays without duplicate notification', async () => {
  let inserts = 0;
  await withMocks([
    [PetInquiry, 'findOne', async () => null],
    [PetInquiry, 'create', async () => { inserts++; }],
    [Pet, 'findById', async () => ({ _id: petId, store: storeId, status: 'sold', isAvailable: false })]
  ], async () => {
    const res = response();
    await controller.create({ user: customer, body: { petId, subject: 'Milo care', question: 'What food does Milo eat?', requestKey: 'submit-key-01' } }, res);
    assert.equal(res.statusCode, 409);
    assert.equal(inserts, 0);
  });
  await withMocks([
    [PetInquiry, 'findOne', async () => inquiry()],
    [PetInquiry, 'create', async () => { inserts++; }]
  ], async () => {
    const res = response();
    await controller.create({ user: customer, body: { petId, requestKey: 'submit-key-01' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.replayed, true);
    assert.equal(inserts, 0);
  });
});

test('seller action atomically appends history and notifies only the customer', async () => {
  const notices = [];
  let update;
  await withMocks([
    [PetInquiry, 'findById', async () => inquiry()],
    [PetInquiry, 'findOneAndUpdate', async (filter, changes) => { update = { filter, changes }; return { ...inquiry('seller_responded'), events: [...inquiry().events, changes.$push.events] }; }],
    [Notification.prototype, 'save', async function () { notices.push(this.toObject()); return this; }]
  ], async () => {
    const res = response();
    await controller.act({ params: { id: inquiryId }, user: seller, body: { action: 'seller_reply', body: 'Milo eats approved food.', requestKey: 'reply-key-01' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(update.filter['events.requestKey'].$ne, 'reply-key-01');
    assert(update.filter.status.$in.includes('submitted'));
    assert.equal(update.changes.$push.events.actor, ownerId);
    assert.equal(notices.length, 1);
    assert.equal(String(notices[0].recipient), customerId);
    assert.equal(notices[0].targetUrl, `/pet-inquiries?id=${inquiryId}`);
    assert.equal(res.body.inquiry.events.at(-1).requestKey, undefined);
  });
});

test('customer follow-up returns to the seller queue and notifies the Store owner', async () => {
  const notices = [];
  await withMocks([
    [PetInquiry, 'findById', async () => inquiry('seller_responded')],
    [PetInquiry, 'findOneAndUpdate', async (_filter, changes) => ({ ...inquiry(changes.$set.status), events: [...inquiry().events, changes.$push.events] })],
    [Store, 'findById', () => ({ select: () => ({ lean: async () => ({ owner: ownerId }) }) })],
    [Notification.prototype, 'save', async function () { notices.push(this.toObject()); return this; }]
  ], async () => {
    const res = response();
    await controller.act({ params: { id: inquiryId }, user: customer, body: { action: 'customer_follow_up', body: 'Does Milo need a special diet?', requestKey: 'followup-key-01' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.inquiry.status, 'awaiting_seller_response');
    assert.equal(String(notices[0].recipient), ownerId);
    assert.equal(notices[0].targetUrl, `/admin/pet-inquiries?id=${inquiryId}`);
  });
});

test('customer follow-up, seller information request, resolution, and cancellation enforce roles and terminal states', async () => {
  assert.equal(validateAction('customer_follow_up', 'customer', 'additional_information_required').to, 'awaiting_seller_response');
  assert.equal(validateAction('information_requested', 'seller', 'awaiting_seller_response').to, 'additional_information_required');
  assert.equal(validateAction('resolved', 'seller', 'seller_responded').to, 'resolved');
  assert.equal(validateAction('cancelled', 'customer', 'submitted').to, 'cancelled');
  assert.throws(() => validateAction('cancelled', 'seller', 'submitted'), /not permitted/);
  assert.throws(() => validateAction('resolved', 'seller', 'cancelled'), /no longer open/);
});

test('archived pet listings cannot receive new inquiries', async () => {
  await withMocks([
    [PetInquiry, 'findOne', async () => null],
    [Pet, 'findById', async () => ({ _id: petId, store: storeId, status: 'available', isAvailable: true, isDeleted: true })]
  ], async () => {
    const res = response();
    await controller.create({ user: customer, body: { petId, subject: 'Care question', question: 'What food does Milo eat?', requestKey: 'submit-key-02' } }, res);
    assert.equal(res.statusCode, 409);
  });
});

test('cross-Store seller and unrelated customer cannot view or act on an inquiry', async () => {
  let updates = 0;
  await withMocks([
    [PetInquiry, 'findById', () => ({ lean: async () => inquiry() })],
    [PetInquiry, 'findOneAndUpdate', async () => { updates++; }]
  ], async () => {
    for (const user of [{ _id: ownerId, role: 'manager', store: otherStoreId }, { _id: otherStoreId, role: 'customer' }]) {
      const read = response();
      await controller.getOne({ user, params: { id: inquiryId } }, read);
      assert.equal(read.statusCode, 404);
    }
  });
  await withMocks([
    [PetInquiry, 'findById', async () => inquiry()],
    [PetInquiry, 'findOneAndUpdate', async () => { updates++; }]
  ], async () => {
    const denied = response();
    await controller.act({ user: { _id: ownerId, role: 'manager', store: otherStoreId }, params: { id: inquiryId }, body: { action: 'seller_reply', body: 'No', requestKey: 'reply-key-01' } }, denied);
    assert.equal(denied.statusCode, 404);
    assert.equal(updates, 0);
  });
});

test('replayed actions and concurrent conflicting transitions cannot send duplicate notifications', async () => {
  let updates = 0;
  await withMocks([
    [PetInquiry, 'findById', async () => ({ ...inquiry(), events: [{ requestKey: 'reply-key-01' }] })],
    [PetInquiry, 'findOneAndUpdate', async () => { updates++; }]
  ], async () => {
    const res = response();
    await controller.act({ user: seller, params: { id: inquiryId }, body: { action: 'seller_reply', body: 'Hello', requestKey: 'reply-key-01' } }, res);
    assert.equal(res.body.replayed, true);
    assert.equal(updates, 0);
  });
  await withMocks([
    [PetInquiry, 'findById', async () => inquiry()],
    [PetInquiry, 'findOneAndUpdate', async () => { updates++; return null; }]
  ], async () => {
    const res = response();
    await controller.act({ user: seller, params: { id: inquiryId }, body: { action: 'resolved', requestKey: 'resolve-key-01' } }, res);
    assert.equal(res.statusCode, 409);
    assert.equal(updates, 1);
  });
});

test('customer list is self-only and seller list uses authorized Store IDs', async () => {
  const filters = [];
  await withMocks([
    [PetInquiry, 'find', filter => { filters.push(filter); return { sort: () => ({ skip: () => ({ limit: () => ({ lean: async () => [] }) }) }) }; }],
    [PetInquiry, 'countDocuments', async () => 0]
  ], async () => {
    await controller.list({ user: customer, query: {} }, response());
    await controller.list({ user: seller, query: {} }, response());
    assert.equal(String(filters[0].customer), customerId);
    assert.deepEqual(filters[1].store.$in, [storeId]);
    await controller.list({ user: seller, query: { status: 'needs_response' } }, response());
    assert.deepEqual(filters[2].status.$in, ['submitted', 'awaiting_seller_response']);
  });
});
