const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { contextKey } = require('../services/supplierChatService');
const { canAccessConversation } = require('../utils/conversationAuthorization');
const { supplierChatRateLimit } = require('../middleware/supplierChatRateLimit');

test('supplier context identity separates general, offer, and purchase-order discussions', () => {
  const store = new mongoose.Types.ObjectId();
  const supplier = new mongoose.Types.ObjectId();
  const order = new mongoose.Types.ObjectId();
  const offer = new mongoose.Types.ObjectId();
  assert.equal(contextKey(store, supplier), contextKey(store, supplier));
  assert.notEqual(contextKey(store, supplier), contextKey(store, supplier, order));
  assert.notEqual(contextKey(store, supplier, order), contextKey(store, supplier, null, offer));
  assert.notEqual(contextKey(store, supplier), contextKey(new mongoose.Types.ObjectId(), supplier));
});

test('supplier message keys and conversation contexts have database unique indexes', () => {
  assert.ok(Conversation.schema.indexes().some(([keys, options]) =>
    keys.supplierContextKey === 1 && options.unique === true && options.partialFilterExpression?.type === 'supplier'));
  assert.ok(Message.schema.indexes().some(([keys, options]) =>
    keys.conversation === 1 && keys.sender === 1 && keys.clientMessageId === 1 && options.unique === true));
});

test('generic customer chat authorization never admits procurement conversation', async () => {
  const userId = new mongoose.Types.ObjectId();
  assert.equal(await canAccessConversation({ _id: userId, role: 'admin' }, {
    type: 'supplier', participants: [{ user: userId }], store: new mongoose.Types.ObjectId()
  }), false);
  assert.equal(await canAccessConversation({ _id: userId, role: 'customer' }, {
    type: 'general', participants: [{ user: userId }], isDeleted: false
  }), true);
});

test('authenticated message rate guard bounds repeated sends', () => {
  const guard = supplierChatRateLimit(2);
  let nextCalls = 0;
  let status;
  const response = { status(code) { status = code; return this; }, json() { return this; } };
  const request = { user: { _id: new mongoose.Types.ObjectId() } };
  guard(request, response, () => { nextCalls += 1; });
  guard(request, response, () => { nextCalls += 1; });
  guard(request, response, () => { nextCalls += 1; });
  assert.equal(nextCalls, 2);
  assert.equal(status, 429);
});
