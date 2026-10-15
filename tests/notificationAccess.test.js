const test = require('node:test');
const assert = require('node:assert/strict');
const Notification = require('../models/Notification');
const controller = require('../controllers/notificationController');

const id = '507f1f77bcf86cd799439011';
const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }
});

test('list uses recipient-scoped pagination and independent unread count', async () => {
  const originals = { find: Notification.find, countDocuments: Notification.countDocuments };
  const queries = [];
  let skip;
  let limit;
  Notification.find = query => {
    queries.push(query);
    return { sort: () => ({ skip: value => {
      skip = value;
      return { limit: value2 => { limit = value2; return Promise.resolve([{ _id: id }]); } };
    } }) };
  };
  Notification.countDocuments = async query => { queries.push(query); return query.isRead ? 72 : 100; };
  try {
    const res = response();
    await controller.getNotifications({ user: { id: 'owner-1' }, query: { page: '2', limit: '25' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(skip, 25);
    assert.equal(limit, 25);
    assert.equal(res.body.unreadCount, 72);
    assert.equal(res.body.pagination.totalPages, 4);
    assert(queries.every(query => query.recipient === 'owner-1' && query.isDeleted.$ne === true));
  } finally { Object.assign(Notification, originals); }
});

test('read, read-all and delete cannot alter another recipient or deleted records', async () => {
  const originals = { findOneAndUpdate: Notification.findOneAndUpdate, updateMany: Notification.updateMany };
  const queries = [];
  Notification.findOneAndUpdate = async query => { queries.push(query); return null; };
  Notification.updateMany = async query => { queries.push(query); return { modifiedCount: 0 }; };
  try {
    const req = { user: { id: 'owner-1' }, params: { id } };
    const read = response();
    await controller.markAsRead(req, read);
    assert.equal(read.statusCode, 404);
    const deleted = response();
    await controller.deleteNotification(req, deleted);
    assert.equal(deleted.statusCode, 404);
    await controller.markAllAsRead(req, response());
    assert(queries.every(query => query.recipient === 'owner-1' && query.isDeleted.$ne === true));
    assert.equal(queries[2].isRead.$ne, true);
    const invalid = response();
    await controller.markAsRead({ ...req, params: { id: 'bad' } }, invalid);
    assert.equal(invalid.statusCode, 400);
  } finally { Object.assign(Notification, originals); }
});
