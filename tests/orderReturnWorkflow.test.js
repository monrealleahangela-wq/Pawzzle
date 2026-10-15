const test = require('node:test');
const assert = require('node:assert/strict');
const Order = require('../models/Order');
const OrderReturn = require('../models/OrderReturn');
const Store = require('../models/Store');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { cloudinary } = require('../middleware/upload');
const { STAGES, planTransition, requestReturn, transitionReturn } = require('../services/orderReturnService');
const { getOrderReturns, getStoreReturns, authorizeReturnEvidenceUpload, uploadReturnEvidence,
  getReturnEvidenceAccess, presentReturn } = require('../controllers/orderReturnController');

const customerId = '507f1f77bcf86cd799439001';
const sellerId = '507f1f77bcf86cd799439002';
const riderId = '507f1f77bcf86cd799439003';
const storeId = '507f1f77bcf86cd799439004';
const orderId = '507f1f77bcf86cd799439005';
const itemId = '507f1f77bcf86cd799439006';
const returnId = '507f1f77bcf86cd799439007';
const seller = { _id: sellerId, role: 'manager', store: storeId };
const customer = { _id: customerId, role: 'customer' };
const rider = { _id: riderId, role: 'delivery_rider', store: storeId };
const row = (status, extra = {}) => ({
  _id: returnId, order: orderId, orderItem: itemId, store: storeId, customer: customerId,
  itemSnapshot: { name: 'Pet supply', itemType: 'product', quantity: 1 },
  status, revision: 0, history: [], refund: { status: 'unlinked' }, ...extra
});
const rights = { seller: true, rider: false, customer: false };

test('seven ordered stages require explicit seller receipt before completion', () => {
  assert.deepEqual(STAGES, ['requested', 'approved', 'preparing', 'ready_for_pickup', 'returning', 'arrived', 'completed']);
  const actions = ['approve', 'prepare', 'ready', 'pickup', 'arrive'];
  let record = row('requested');
  for (const action of actions) record.status = planTransition(record, action, rights);
  assert.equal(record.status, 'arrived');
  assert.throws(() => planTransition(record, 'complete', rights), { code: 'SELLER_RECEIPT_REQUIRED' });
  assert.equal(planTransition(record, 'confirm_receipt', rights), 'arrived');
  record.sellerReceipt = { confirmedAt: new Date() };
  assert.equal(planTransition(record, 'complete', rights), 'completed');
  assert.throws(() => planTransition({ ...record, status: 'completed' }, 'complete', rights), { code: 'RETURN_CLOSED' });
});

test('skipped stages, duplicate actions, and unauthorized transport fail closed', () => {
  assert.throws(() => planTransition(row('requested'), 'pickup', rights), { code: 'INVALID_RETURN_TRANSITION' });
  assert.throws(() => planTransition(row('approved'), 'approve', rights), { code: 'INVALID_RETURN_TRANSITION' });
  assert.throws(() => planTransition(row('ready_for_pickup'), 'pickup',
    { seller: false, rider: false, customer: true }), { code: 'RETURN_FORBIDDEN' });
  assert.equal(planTransition(row('ready_for_pickup'), 'pickup',
    { seller: false, rider: true, customer: false }), 'returning');
  assert.throws(() => planTransition(row('approved'), 'cancel',
    { seller: false, rider: false, customer: true }), { code: 'RETURN_FORBIDDEN' });
});

test('delay and failed pickup remain exceptions, never successful stages', () => {
  assert.equal(planTransition(row('ready_for_pickup'), 'report_pickup_failed', rights), 'ready_for_pickup');
  assert.throws(() => planTransition(row('ready_for_pickup', { exception: { kind: 'pickup_failed' } }), 'pickup', rights),
    { code: 'RETURN_EXCEPTION_OPEN' });
  assert.equal(planTransition(row('ready_for_pickup', { exception: { kind: 'pickup_failed' } }), 'resolve_exception', rights),
    'ready_for_pickup');
  assert.throws(() => planTransition(row('returning'), 'report_pickup_failed', rights), { code: 'INVALID_RETURN_TRANSITION' });
});

test('only paid delivered items can request a separate customer return; repeats are idempotent', async () => {
  const originals = { findOrder: Order.findById, findReturn: OrderReturn.findOne,
    create: OrderReturn.create, findStore: Store.findById };
  const order = { _id: orderId, customer: customerId, store: storeId,
    status: 'delivered', paymentStatus: 'paid', items: [{ _id: itemId, name: 'Pet supply', itemType: 'product', quantity: 1 }] };
  let saved;
  Order.findById = async () => order;
  OrderReturn.findOne = async () => saved || null;
  OrderReturn.create = async input => { saved = input; return input; };
  Store.findById = () => ({ select: async () => null });
  try {
    const first = await requestReturn({ user: customer, orderId, itemId, reason: 'Item needs review' });
    assert.equal(first.created, true);
    assert.equal(first.record.status, 'requested');
    assert.equal(first.record.history.length, 1);
    const second = await requestReturn({ user: customer, orderId, itemId, reason: 'Repeated request' });
    assert.equal(second.created, false);
    assert.equal(second.record._id.toString(), first.record._id.toString());
    order.status = 'returned'; // Outbound delivery failure is not customer return eligibility.
    saved = null;
    await assert.rejects(requestReturn({ user: customer, orderId, itemId, reason: 'Wrong flow' }),
      { code: 'RETURN_NOT_ELIGIBLE' });
    order.status = 'delivered'; order.paymentStatus = 'pending';
    await assert.rejects(requestReturn({ user: customer, orderId, itemId, reason: 'Unpaid' }),
      { code: 'RETURN_NOT_ELIGIBLE' });
    order.paymentStatus = 'paid';
    await assert.rejects(requestReturn({ user: { _id: sellerId, role: 'customer' }, orderId, itemId, reason: 'Other customer' }),
      { code: 'ORDER_NOT_FOUND' });
  } finally {
    Order.findById = originals.findOrder; OrderReturn.findOne = originals.findReturn;
    OrderReturn.create = originals.create; Store.findById = originals.findStore;
  }
});

test('conditional transition records one event; stale concurrent update and cross-Store actor fail', async () => {
  const originals = { find: OrderReturn.findById, update: OrderReturn.findOneAndUpdate,
    findStore: Store.findById, findUser: User.findOne, saveNotification: Notification.prototype.save };
  let persisted = row('requested');
  OrderReturn.findById = async () => ({ ...persisted, history: [...persisted.history] });
  OrderReturn.findOneAndUpdate = async (filter, update) => {
    if (persisted.revision !== filter.revision || persisted.status !== filter.status) return null;
    persisted = { ...persisted, ...update.$set, revision: persisted.revision + 1,
      history: [...persisted.history, update.$push.history] };
    return persisted;
  };
  Store.findById = () => ({ select: async () => null });
  User.findOne = async () => null;
  let notifications = 0;
  Notification.prototype.save = async function () { notifications += 1; return this; };
  try {
    const approved = await transitionReturn({ user: seller, returnId, action: 'approve' });
    assert.equal(approved.status, 'approved');
    assert.equal(approved.history.length, 1);
    assert.equal(approved.refund.status, 'unlinked');
    assert.equal(notifications, 1);
    await assert.rejects(transitionReturn({ user: seller, returnId, action: 'approve' }),
      { code: 'INVALID_RETURN_TRANSITION' });
    await assert.rejects(transitionReturn({ user: { ...seller, store: '507f1f77bcf86cd799439099' },
      returnId, action: 'prepare' }), { code: 'RETURN_FORBIDDEN' });
    await assert.rejects(transitionReturn({ user: rider, returnId, action: 'prepare' }),
      { code: 'RETURN_FORBIDDEN' });
    persisted = row('arrived', { sellerReceipt: { confirmedAt: new Date(), confirmedBy: sellerId } });
    const completed = await transitionReturn({ user: seller, returnId, action: 'complete' });
    assert.equal(completed.status, 'completed');
    assert.equal(completed.refund.status, 'unlinked');
  } finally {
    OrderReturn.findById = originals.find; OrderReturn.findOneAndUpdate = originals.update;
    Store.findById = originals.findStore; User.findOne = originals.findUser;
    Notification.prototype.save = originals.saveNotification;
  }
});

test('concurrent seller actions can publish only one transition and notification', async () => {
  const originals = { find: OrderReturn.findById, update: OrderReturn.findOneAndUpdate,
    findStore: Store.findById, saveNotification: Notification.prototype.save };
  let persisted = row('requested');
  let reads = 0;
  let releaseReads;
  const bothRead = new Promise(resolve => { releaseReads = resolve; });
  OrderReturn.findById = async () => {
    const snapshot = { ...persisted };
    if (++reads === 2) releaseReads();
    await bothRead;
    return snapshot;
  };
  OrderReturn.findOneAndUpdate = async (filter, update) => {
    if (persisted.status !== filter.status || persisted.revision !== filter.revision) return null;
    persisted = { ...persisted, ...update.$set, revision: persisted.revision + 1,
      history: [...persisted.history, update.$push.history] };
    return persisted;
  };
  Store.findById = () => ({ select: async () => null });
  let notifications = 0;
  Notification.prototype.save = async function () { notifications += 1; return this; };
  try {
    const results = await Promise.allSettled([
      transitionReturn({ user: seller, returnId, action: 'approve' }),
      transitionReturn({ user: seller, returnId, action: 'approve' })
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.find(result => result.status === 'rejected')?.reason.code, 'RETURN_CONFLICT');
    assert.equal(persisted.history.length, 1);
    assert.equal(notifications, 1);
  } finally {
    OrderReturn.findById = originals.find; OrderReturn.findOneAndUpdate = originals.update;
    Store.findById = originals.findStore; Notification.prototype.save = originals.saveNotification;
  }
});

test('foreign customer cannot read return history from another order', async () => {
  const original = Order.findById;
  Order.findById = async () => ({ _id: orderId, customer: customerId, store: storeId });
  let status;
  let body;
  const res = { status(code) { status = code; return this; }, json(payload) { body = payload; return this; } };
  try {
    await getOrderReturns({ params: { orderId }, user: { _id: sellerId, role: 'customer' } }, res);
    assert.equal(status, 403);
    assert.equal(body.code, 'RETURN_FORBIDDEN');
  } finally { Order.findById = original; }
});

test('return evidence metadata never exposes the private asset identifier', () => {
  const result = presentReturn(row('requested', { evidence: [{ _id: itemId,
    publicId: 'private/asset', deliveryType: 'authenticated', originalName: 'condition.jpg', size: 120,
    uploadedBy: customerId, uploadedAt: new Date() }] }));
  assert.equal(result.evidence[0].publicId, undefined);
  assert.equal(result.evidence[0].originalName, 'condition.jpg');
});

test('evidence upload requires a participant and atomically appends metadata and history', async () => {
  const originalFind = OrderReturn.findById;
  const originalUpdate = OrderReturn.findOneAndUpdate;
  OrderReturn.findById = async () => row('requested');
  let updatedFilter;
  let updatedValues;
  OrderReturn.findOneAndUpdate = async (filter, values) => {
    updatedFilter = filter; updatedValues = values;
    return row('requested', { evidence: [{ _id: itemId, ...values.$push.evidence }] });
  };
  const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; } });
  try {
    const denied = response();
    await authorizeReturnEvidenceUpload({ params: { id: returnId },
      user: { _id: sellerId, role: 'customer' } }, denied, () => {});
    assert.equal(denied.statusCode, 403);
    const req = { params: { id: returnId }, user: customer,
      file: { filename: 'pawzzle/return-evidence/image', path: 'https://example.invalid/image.jpg',
        originalname: 'condition.jpg', size: 120 } };
    let authorized = false;
    await authorizeReturnEvidenceUpload(req, response(), () => { authorized = true; });
    assert.equal(authorized, true);
    const uploaded = response();
    await uploadReturnEvidence(req, uploaded);
    assert.equal(uploaded.statusCode, 200);
    assert.equal(updatedFilter.status, 'requested');
    assert.equal(updatedFilter.revision, 0);
    assert.equal(updatedValues.$push.history.action, 'add_evidence');
    assert.equal(uploaded.body.return.evidence[0].publicId, undefined);
  } finally { OrderReturn.findById = originalFind; OrderReturn.findOneAndUpdate = originalUpdate; }
});

test('conflicting evidence update removes its unattached private upload', async () => {
  const originalUpdate = OrderReturn.findOneAndUpdate;
  const originalDestroy = cloudinary.uploader.destroy;
  let removed;
  OrderReturn.findOneAndUpdate = async () => null;
  cloudinary.uploader.destroy = async (publicId, options) => { removed = { publicId, options }; };
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; } };
  try {
    await uploadReturnEvidence({ user: customer, orderReturnForEvidence: row('requested'),
      file: { filename: 'pawzzle/return-evidence/orphan', path: 'https://example.invalid/item.jpg',
        originalname: 'item.jpg', size: 120 } }, res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'RETURN_CONFLICT');
    assert.equal(removed.publicId, 'pawzzle/return-evidence/orphan');
    assert.equal(removed.options.type, 'authenticated');
  } finally { OrderReturn.findOneAndUpdate = originalUpdate; cloudinary.uploader.destroy = originalDestroy; }
});

test('cross-Store staff cannot obtain a signed return evidence link', async () => {
  const originalFind = OrderReturn.findById;
  OrderReturn.findById = async () => row('requested', { evidence: [{ _id: itemId,
    publicId: 'pawzzle/return-evidence/private', format: 'jpg', deliveryType: 'authenticated' }] });
  let status;
  let body;
  const res = { status(code) { status = code; return this; }, json(value) { body = value; return this; } };
  try {
    await getReturnEvidenceAccess({ params: { id: returnId, evidenceId: itemId },
      user: { _id: sellerId, role: 'manager', store: '507f1f77bcf86cd799439099' } }, res);
    assert.equal(status, 403);
    assert.equal(body.code, 'RETURN_FORBIDDEN');
  } finally { OrderReturn.findById = originalFind; }
});

test('Store return queue is restricted to authorized Store IDs and management permission', async () => {
  const originalFind = OrderReturn.find;
  const originalUserFind = User.find;
  let storeFilter;
  OrderReturn.find = filter => {
    storeFilter = filter.store;
    return { sort: () => ({ limit: () => ({ lean: async () => [row('requested')] }) }) };
  };
  User.find = () => ({ select: () => ({ lean: async () => [] }) });
  const res = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; } });
  try {
    const allowed = res();
    await getStoreReturns({ user: seller }, allowed);
    assert.equal(allowed.statusCode, 200);
    assert.deepEqual(storeFilter.$in, [storeId]);
    assert.equal(allowed.body.returns.length, 1);
    const denied = res();
    await getStoreReturns({ user: { _id: sellerId, role: 'staff', staffType: 'order_staff', store: storeId } }, denied);
    assert.equal(denied.statusCode, 403);
  } finally { OrderReturn.find = originalFind; User.find = originalUserFind; }
});

test('transport milestone notifies the customer and Store owner, not the acting Rider', async () => {
  const originals = { find: OrderReturn.findById, update: OrderReturn.findOneAndUpdate,
    store: Store.findById, notification: Notification.prototype.save };
  const record = row('ready_for_pickup', { assignedRider: riderId });
  const recipients = [];
  OrderReturn.findById = async () => record;
  OrderReturn.findOneAndUpdate = async (_filter, update) => ({ ...record, ...update.$set,
    history: [update.$push.history] });
  Store.findById = () => ({ select: async () => ({ owner: sellerId }) });
  Notification.prototype.save = async function () { recipients.push(String(this.recipient)); return this; };
  try {
    const updated = await transitionReturn({ user: rider, returnId, action: 'pickup' });
    assert.equal(updated.status, 'returning');
    assert.deepEqual(recipients.sort(), [customerId, sellerId].sort());
  } finally {
    OrderReturn.findById = originals.find; OrderReturn.findOneAndUpdate = originals.update;
    Store.findById = originals.store; Notification.prototype.save = originals.notification;
  }
});
