const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const chat = require('../services/supplierChatService');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const genericChat = require('../controllers/chatController');

const configuredUri = process.env.MONGODB_TRANSACTION_TEST_URI;
test('isolated Supplier chat persists tenant-scoped, deduplicated messages and read state', {
  skip: !configuredUri && 'MONGODB_TRANSACTION_TEST_URI is not configured'
}, async () => {
  const uri = new URL(configuredUri);
  assert.equal(uri.protocol, 'mongodb:');
  assert.equal(uri.hostname, '127.0.0.1');
  assert.equal(uri.port, '27018');
  assert.equal(uri.searchParams.get('replicaSet'), 'pawzzleTestRS');
  uri.pathname = `/pawzzle_supplier_chat_${crypto.randomBytes(8).toString('hex')}`;
  await mongoose.connect(uri.toString(), { serverSelectionTimeoutMS: 5000 });
  const id = () => new mongoose.Types.ObjectId();
  try {
    await Promise.all([Conversation.init(), Message.init(), Notification.init()]);
    const storeId = id(); const otherStoreId = id(); const supplierId = id();
    const ownerId = id(); const otherOwnerId = id(); const supplierUserId = id(); const strangerId = id();
    const orderId = id(); const offerId = id();
    const db = mongoose.connection.db;
    await db.collection('users').insertMany([
      { _id: ownerId, email: 'owner@synthetic.test', username: 'synthetic_owner', role: 'admin', store: storeId, isActive: true, isDeleted: false },
      { _id: otherOwnerId, email: 'other@synthetic.test', username: 'synthetic_other', role: 'admin', store: otherStoreId, isActive: true, isDeleted: false },
      { _id: supplierUserId, email: 'supplier@synthetic.test', username: 'synthetic_supplier', role: 'supplier', isActive: true, isDeleted: false },
      { _id: strangerId, email: 'customer@synthetic.test', username: 'synthetic_customer', role: 'customer', isActive: true, isDeleted: false }
    ]);
    await db.collection('stores').insertMany([
      { _id: storeId, owner: ownerId, name: 'Synthetic Store', slug: 'synthetic-store', isActive: true, isDeleted: false },
      { _id: otherStoreId, owner: otherOwnerId, name: 'Other Store', slug: 'synthetic-other-store', isActive: true, isDeleted: false }
    ]);
    await db.collection('suppliers').insertOne({ _id: supplierId, user: supplierUserId,
      supplierType: 'platform', businessName: 'Synthetic Supplier', status: 'verified', isActive: true, isDeleted: false });
    await db.collection('purchaseorders').insertOne({ _id: orderId, store: storeId, supplier: supplierId,
      status: 'submitted', paymentStatus: 'unpaid' });
    await db.collection('supplierproducts').insertOne({ _id: offerId, supplier: supplierId, isDeleted: false, availableStock: 7 });
    const owner = { _id: ownerId, role: 'admin', store: storeId };
    const otherOwner = { _id: otherOwnerId, role: 'admin', store: otherStoreId };
    const supplier = { _id: supplierUserId, role: 'supplier' };
    const stranger = { _id: strangerId, role: 'customer' };

    const conversations = await Promise.all(Array.from({ length: 4 }, () =>
      chat.createOrGetConversation(owner, { supplierId })));
    assert.equal(new Set(conversations.map(row => String(row._id))).size, 1);
    const conversationId = conversations[0]._id;
    await conversations[0].validate();
    const orderConversation = await chat.createOrGetConversation(supplier, { purchaseOrderId: orderId });
    const offerConversation = await chat.createOrGetConversation(owner, { supplierId, supplierProductId: offerId });
    assert.notEqual(String(conversationId), String(orderConversation._id));
    assert.notEqual(String(conversationId), String(offerConversation._id));
    await assert.rejects(chat.createOrGetConversation(otherOwner, { supplierId, purchaseOrderId: orderId }),
      error => error.status === 404);
    await assert.rejects(chat.createOrGetConversation(stranger, { supplierId }), error => error.status === 403);

    const rolledBackId = 'synthetic_rollback_001';
    const originalUpdate = Conversation.updateOne;
    Conversation.updateOne = async () => { throw new Error('Synthetic conversation update failure'); };
    try {
      await assert.rejects(chat.sendMessage(owner, orderConversation._id,
        { content: 'Must roll back', clientMessageId: rolledBackId }), /Synthetic conversation update failure/);
    } finally { Conversation.updateOne = originalUpdate; }
    assert.equal(await Message.countDocuments({ conversation: orderConversation._id }), 0);
    assert.equal(await Notification.countDocuments({ relatedId: orderConversation._id }), 0);

    const sent = await Promise.all(Array.from({ length: 4 }, () => chat.sendMessage(owner, conversationId,
      { content: 'Synthetic procurement discussion', clientMessageId: 'synthetic_request_001' })));
    assert.equal(sent.filter(result => result.created).length, 1);
    assert.equal(await Message.countDocuments({ conversation: conversationId }), 1);
    assert.equal(await Notification.countDocuments({ relatedId: conversationId }), 1);
    assert.equal(await Notification.countDocuments({ recipient: { $in: [otherOwnerId, strangerId] } }), 0);
    const supplierNotifications = await Notification.find({ recipient: supplierUserId }).lean();
    assert.equal(supplierNotifications.length, 1);
    assert.match(supplierNotifications[0].targetUrl, /^\/supplier\/messages\?conversation=/);
    assert.doesNotMatch(supplierNotifications[0].message, /Synthetic procurement discussion/);
    await assert.rejects(chat.sendMessage(owner, conversationId,
      { content: 'Different text', clientMessageId: 'synthetic_request_001' }), error => error.status === 409);
    await chat.sendMessage(supplier, conversationId, { content: 'Reply', clientMessageId: 'synthetic_request_002' });
    const page = await chat.listMessages(owner, conversationId, { limit: 1 });
    assert.equal(page.messages.length, 1);
    assert.equal(page.hasMore, true);
    const older = await chat.listMessages(owner, conversationId, { limit: 1, before: page.nextCursor });
    assert.equal(older.messages.length, 1);
    assert.equal((await chat.listConversations(owner))[0].unreadCount, 1);
    assert.equal(await chat.markRead(owner, conversationId), 1);
    assert.equal(await chat.markRead(owner, conversationId), 0);
    assert.equal((await chat.listConversations(owner))[0].unreadCount, 0);
    assert.equal((await chat.listConversations(supplier)).length, 3);
    await assert.rejects(chat.listMessages(otherOwner, conversationId), error => error.status === 403);
    await assert.rejects(chat.markRead(stranger, conversationId), error => error.status === 403);
    let genericStatus = 200;
    await genericChat.getMessages({ user: owner, params: { conversationId: String(conversationId) } }, {
      status(code) { genericStatus = code; return this; }, json() { return this; }
    });
    assert.equal(genericStatus, 403);
    assert.equal(await chat.canAccessSocketRoom({ data: { userId: supplierUserId } }, conversationId), true);
    assert.equal(await chat.canAccessSocketRoom({ data: { userId: otherOwnerId } }, conversationId), false);
    assert.equal(await chat.canAccessSocketRoom({ data: { userId: strangerId } }, conversationId), false);
    const makeSocket = userId => {
      const handlers = {};
      const rooms = new Set();
      const socket = { data: { userId }, on: (event, handler) => { handlers[event] = handler; },
        join: room => rooms.add(room), leave: room => rooms.delete(room) };
      chat.registerSupplierChatSocketHandlers(socket);
      return { handlers, rooms };
    };
    const allowedSocket = makeSocket(supplierUserId);
    let acknowledgement;
    await allowedSocket.handlers.joinSupplierConversation(String(conversationId), result => { acknowledgement = result; });
    assert.deepEqual(acknowledgement, { allowed: true });
    assert.equal(allowedSocket.rooms.has(`supplier_conversation_${conversationId}`), true);
    allowedSocket.handlers.leaveSupplierConversation(String(conversationId));
    assert.equal(allowedSocket.rooms.size, 0);
    const deniedSocket = makeSocket(otherOwnerId);
    await deniedSocket.handlers.joinSupplierConversation(String(conversationId), result => { acknowledgement = result; });
    assert.deepEqual(acknowledgement, { allowed: false });
    assert.equal(deniedSocket.rooms.size, 0);
    const order = await db.collection('purchaseorders').findOne({ _id: orderId });
    const offer = await db.collection('supplierproducts').findOne({ _id: offerId });
    assert.equal(order.status, 'submitted');
    assert.equal(order.paymentStatus, 'unpaid');
    assert.equal(offer.availableStock, 7);
    assert.equal(await db.collection('supplierpartnerships').countDocuments(), 0);
    await Promise.all(Array.from({ length: 5 }, (_, index) => chat.sendMessage(owner, offerConversation._id,
      { content: `Offer question ${index}`, clientMessageId: `parallel_offer_${index}` })));
    const offerMessages = await Message.find({ conversation: offerConversation._id }).sort({ createdAt: 1, _id: 1 }).lean();
    const offerState = await Conversation.findById(offerConversation._id).lean();
    assert.equal(offerMessages.length, 5);
    assert.equal(String(offerState.lastMessage.messageId), String(offerMessages[4]._id));
    await db.collection('suppliers').updateOne({ _id: supplierId }, { $set: { status: 'suspended' } });
    await assert.rejects(chat.sendMessage(owner, conversationId,
      { content: 'Must be blocked', clientMessageId: 'synthetic_request_003' }), error => error.status === 409);
    assert.equal((await chat.listMessages(owner, conversationId)).messages.length, 2);
    await db.collection('suppliers').updateOne({ _id: supplierId }, { $set: { status: 'verified' } });
    await db.collection('conversations').dropIndex('supplierContextKey_1');
    await assert.rejects(chat.createOrGetConversation(owner, { supplierId }), error => error.status === 503);
    await db.collection('messages').dropIndex('conversation_1_sender_1_clientMessageId_1');
    await assert.rejects(chat.sendMessage(owner, conversationId,
      { content: 'Index must exist', clientMessageId: 'synthetic_request_004' }), error => error.status === 503);
    assert.equal(await Message.countDocuments({ conversation: conversationId }), 2);
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
