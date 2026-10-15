const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const Supplier = require('../models/Supplier');
const SupplierProduct = require('../models/SupplierProduct');
const Store = require('../models/Store');
const User = require('../models/User');
const PurchaseOrder = require('../models/PurchaseOrder');
const { isStoreAdmin, hasPermission } = require('../config/permissions');
const { canAccessStore, idsEqual } = require('../utils/authorizationPolicy');
const { isSupplierSelectableForStore } = require('../utils/supplierLifecycle');
const { attachStoreRolePolicy } = require('./rolePermissionService');

const chatError = (status, message) => Object.assign(new Error(message), { status });
const objectId = value => mongoose.isValidObjectId(value) ? value : null;
const storeChatRole = user => isStoreAdmin(user)
  && (hasPermission(user, 'procurement.manage') || hasPermission(user, 'procurement.view'));
const contextKey = (storeId, supplierId, orderId, offerId) =>
  `${storeId}:${supplierId}:${orderId ? `order:${orderId}` : offerId ? `offer:${offerId}` : 'general'}`;

// Mongoose builds indexes asynchronously at startup. Do not accept a write
// until the database has the unique constraint that makes its retry safe.
const requireUniqueIndex = async (model, keys, partialFilterExpression) => {
  try {
    await model.init();
    const indexes = await model.collection.indexes();
    const matches = indexes.some(index => index.unique === true
      && Object.keys(index.key).length === Object.keys(keys).length
      && Object.entries(keys).every(([key, direction]) => index.key[key] === direction)
      && JSON.stringify(index.partialFilterExpression) === JSON.stringify(partialFilterExpression));
    if (matches) return;
  } catch (_error) { /* Missing indexes and failed builds have the same safe response. */ }
  throw chatError(503, 'Supplier messaging is not ready. Please retry shortly.');
};

const requireConversationIndex = () => requireUniqueIndex(Conversation,
  { supplierContextKey: 1 }, { type: 'supplier' });
const requireMessageIndex = () => requireUniqueIndex(Message,
  { conversation: 1, sender: 1, clientMessageId: 1 }, { clientMessageId: { $type: 'string' } });

const resolveStore = async user => {
  if (!storeChatRole(user)) throw chatError(403, 'Store procurement access is required.');
  const store = await Store.findOne({
    ...(user.store ? { _id: user.store?._id || user.store } : { owner: user._id }),
    isDeleted: { $ne: true }
  }).select('_id owner name isActive');
  if (!store || !(await canAccessStore(user, store._id))) throw chatError(403, 'Store access denied.');
  return store;
};

const assertAccess = async (user, conversation, { write = false } = {}) => {
  if (!conversation || conversation.type !== 'supplier' || conversation.isDeleted) {
    throw chatError(404, 'Supplier conversation not found.');
  }
  const [store, supplier] = await Promise.all([
    Store.findById(conversation.store).select('_id owner name isActive isDeleted'),
    Supplier.findById(conversation.supplier)
      .select('_id user businessName supplierType storeAssociations status isActive isDeleted')
  ]);
  if (!store || !supplier || store.isDeleted || supplier.isDeleted) throw chatError(404, 'Supplier conversation not found.');
  const supplierUser = user.role === 'supplier' && idsEqual(supplier.user, user._id);
  const storeUser = storeChatRole(user) && await canAccessStore(user, store._id);
  if (!supplierUser && !storeUser) throw chatError(403, 'Supplier conversation access denied.');
  if (write && (store.isActive === false || !isSupplierSelectableForStore(supplier, store._id))) {
    throw chatError(409, 'This Supplier or Store is no longer available for new messages.');
  }
  if (write && !(await User.exists({ _id: supplier.user, isActive: true, isDeleted: false }))) {
    throw chatError(409, 'The Supplier account is not available for new messages.');
  }
  return { store, supplier, supplierUser };
};

const getConversation = async (user, id, options) => {
  if (!objectId(id)) throw chatError(400, 'Invalid conversation ID.');
  const conversation = await Conversation.findById(id);
  await assertAccess(user, conversation, options);
  return conversation;
};

const createOrGetConversation = async (user, input = {}) => {
  const orderId = input.purchaseOrderId ? objectId(input.purchaseOrderId) : null;
  const offerId = input.supplierProductId ? objectId(input.supplierProductId) : null;
  if ((input.purchaseOrderId && !orderId) || (input.supplierProductId && !offerId)
    || (orderId && offerId)) throw chatError(400, 'Invalid procurement context.');
  let store;
  let supplier;
  if (user.role === 'supplier') {
    if (!orderId) throw chatError(403, 'Suppliers may open a conversation from their own purchase order.');
    supplier = await Supplier.findOne({ user: user._id, isDeleted: false });
    if (!supplier) throw chatError(403, 'Supplier profile not found.');
  } else {
    store = await resolveStore(user);
    if (!objectId(input.supplierId)) throw chatError(400, 'Invalid Supplier ID.');
    supplier = await Supplier.findById(input.supplierId);
  }
  if (!supplier) throw chatError(404, 'Supplier not found.');
  if (orderId) {
    const order = await PurchaseOrder.findById(orderId).select('store supplier');
    if (!order || !idsEqual(order.supplier, supplier._id)
      || (store && !idsEqual(order.store, store._id))) throw chatError(404, 'Purchase order not found for this Supplier and Store.');
    store = await Store.findOne({ _id: order.store, isDeleted: { $ne: true } }).select('_id owner name isActive');
  }
  if (!store) throw chatError(404, 'Store not found.');
  if (offerId) {
    const offer = await SupplierProduct.findById(offerId).select('supplier isDeleted');
    if (!offer || offer.isDeleted || !idsEqual(offer.supplier, supplier._id)) {
      throw chatError(404, 'Supplier offer not found.');
    }
  }
  if (user.role !== 'supplier' && !(await canAccessStore(user, store._id))) throw chatError(403, 'Store access denied.');
  if (store.isActive === false || !isSupplierSelectableForStore(supplier, store._id)) {
    throw chatError(409, 'This Supplier is not eligible for this Store.');
  }
  if (!(await User.exists({ _id: supplier.user, isActive: true, isDeleted: false }))) {
    throw chatError(409, 'The Supplier account is not available.');
  }
  await requireConversationIndex();
  const key = contextKey(store._id, supplier._id, orderId, offerId);
  const participants = [
    { user: store.owner, role: 'store_owner' },
    { user: supplier.user, role: 'supplier' }
  ];
  let conversation;
  try {
    conversation = await Conversation.findOneAndUpdate(
      { supplierContextKey: key },
      { $setOnInsert: {
        supplierContextKey: key, type: 'supplier', store: store._id, supplier: supplier._id,
        purchaseOrder: orderId, supplierProduct: offerId, participants, status: 'active'
      } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    conversation = await Conversation.findOne({ supplierContextKey: key });
    if (!conversation) throw error;
  }
  await assertAccess(user, conversation, { write: true });
  return conversation;
};

const listConversations = async user => {
  let filter;
  if (user.role === 'supplier') {
    const supplier = await Supplier.findOne({ user: user._id, isDeleted: false }).select('_id');
    if (!supplier) throw chatError(403, 'Supplier profile not found.');
    filter = { supplier: supplier._id };
  } else {
    const store = await resolveStore(user);
    filter = { store: store._id };
  }
  const rows = await Conversation.find({ type: 'supplier', isDeleted: { $ne: true }, ...filter })
    .select('store supplier purchaseOrder supplierProduct lastMessage createdAt updatedAt')
    .populate('store', 'name').populate('supplier', 'businessName')
    .populate('purchaseOrder', 'orderNumber')
    .sort({ updatedAt: -1 }).limit(100).lean();
  return Promise.all(rows.map(async row => ({
    ...row,
    unreadCount: await Message.countDocuments({ conversation: row._id,
      sender: { $ne: user._id }, readBy: { $ne: user._id }, isDeleted: { $ne: true } })
  })));
};

const listMessages = async (user, id, { before, limit = 30 } = {}) => {
  const conversation = await getConversation(user, id);
  const count = Number(limit);
  if (!Number.isInteger(count) || count < 1 || count > 50) throw chatError(400, 'Invalid page size.');
  if (before && !objectId(before)) throw chatError(400, 'Invalid message cursor.');
  const rows = await Message.find({ conversation: conversation._id, isDeleted: { $ne: true },
    ...(before ? { _id: { $lt: before } } : {}) })
    .select('sender content readBy createdAt clientMessageId')
    .populate('sender', 'firstName lastName role')
    .sort({ _id: -1 }).limit(count + 1).lean();
  const hasMore = rows.length > count;
  const page = rows.slice(0, count).reverse();
  return { messages: page, hasMore, nextCursor: hasMore ? String(page[0]._id) : null };
};

const recipientIds = async (conversation, senderId) => {
  const store = await Store.findById(conversation.store).select('owner');
  const supplier = await Supplier.findById(conversation.supplier).select('user');
  const storeUsers = await User.find({
    $or: [{ _id: store.owner }, { store: conversation.store, role: { $in: ['admin', 'store_owner'] } }],
    isActive: true, isDeleted: false
  }).select('_id role store');
  const authorizedStoreUsers = [];
  for (const storeUser of storeUsers) {
    await attachStoreRolePolicy(storeUser);
    if (storeChatRole(storeUser) && await canAccessStore(storeUser, conversation.store)) {
      authorizedStoreUsers.push(String(storeUser._id));
    }
  }
  return { supplierUserId: String(supplier.user), ids: [
    ...new Set([...authorizedStoreUsers, String(supplier.user)])
  ].filter(id => id !== String(senderId)) };
};

const sendMessage = async (user, id, { content, clientMessageId } = {}, io) => {
  const conversation = await getConversation(user, id, { write: true });
  if (typeof content !== 'string' || !content.trim() || content.trim().length > 2000
    || /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(content)) throw chatError(400, 'Message must be plain text of 1–2000 characters.');
  if (typeof clientMessageId !== 'string' || !/^[a-zA-Z0-9_-]{12,80}$/.test(clientMessageId)) {
    throw chatError(400, 'A valid client message ID is required.');
  }
  await requireMessageIndex();
  const recipients = await recipientIds(conversation, user._id);
  let message;
  let notifications = [];
  let created = false;
  try {
    await mongoose.connection.transaction(async session => {
      [message] = await Message.create([{ conversation: conversation._id, sender: user._id,
        content: content.trim(), type: 'text', clientMessageId, readBy: [user._id] }], { session });
      await Conversation.updateOne({ _id: conversation._id,
        $or: [{ 'lastMessage.timestamp': { $exists: false } },
          { 'lastMessage.timestamp': { $lt: message.createdAt } },
          { 'lastMessage.timestamp': message.createdAt, 'lastMessage.messageId': { $lt: message._id } }] },
      { $set: { lastMessage: { content: message.content, type: 'text', sender: user._id,
        timestamp: message.createdAt, messageId: message._id }, updatedAt: message.createdAt } },
      { session, timestamps: false });
      if (recipients.ids.length) notifications = await Notification.insertMany(recipients.ids.map(recipient => ({
        recipient, sender: user._id, type: 'chat_message', title: 'New Supplier message',
        message: 'You have a new procurement conversation message.',
        relatedModel: 'Conversation', relatedId: conversation._id,
        targetUrl: recipient === recipients.supplierUserId
          ? `/supplier/messages?conversation=${conversation._id}`
          : `/admin/supplier-messages?conversation=${conversation._id}`,
        dedupeKey: `supplier-chat:${message._id}:${recipient}`
      })), { session });
    });
    created = true;
  } catch (error) {
    if (error.code !== 11000) throw error;
    message = await Message.findOne({ conversation: conversation._id, sender: user._id, clientMessageId });
    if (!message) throw error;
    if (message.content !== content.trim()) throw chatError(409, 'Message ID was already used for different content.');
  }
  if (created && io) for (const notification of notifications) {
    try { io.to(`user_${notification.recipient}`).emit('newNotification', notification); } catch (_error) { /* Polling remains available. */ }
  }
  if (created && io) await emitToAuthorizedRoom(io, conversation._id, 'supplierMessage', {
    conversationId: String(conversation._id), message: {
      _id: message._id, sender: message.sender, content: message.content, createdAt: message.createdAt
    }
  }).catch(() => {});
  return { message, created };
};

const markRead = async (user, id, io) => {
  const conversation = await getConversation(user, id);
  const result = await Message.updateMany({ conversation: conversation._id, sender: { $ne: user._id },
    readBy: { $ne: user._id }, isDeleted: { $ne: true } }, { $addToSet: { readBy: user._id } });
  if (result.modifiedCount && io) await emitToAuthorizedRoom(io, conversation._id, 'supplierMessagesRead', {
    conversationId: String(conversation._id), userId: String(user._id)
  });
  return result.modifiedCount;
};

const canAccessSocketRoom = async (socket, id) => {
  if (!objectId(id) || !socket.data?.userId) return false;
  const user = await User.findOne({ _id: socket.data.userId, isActive: true, isDeleted: false });
  if (!user) return false;
  await attachStoreRolePolicy(user);
  try { await getConversation(user, id); return true; } catch (_error) { return false; }
};

const emitToAuthorizedRoom = async (io, id, event, payload) => {
  const room = `supplier_conversation_${id}`;
  const sockets = await io.in(room).fetchSockets();
  for (const socket of sockets) {
    if (!(await canAccessSocketRoom(socket, id))) await socket.leave(room);
  }
  io.to(room).emit(event, payload);
};

const registerSupplierChatSocketHandlers = socket => {
  socket.on('joinSupplierConversation', async (conversationId, acknowledge) => {
    const allowed = await canAccessSocketRoom(socket, conversationId).catch(() => false);
    if (allowed) socket.join(`supplier_conversation_${conversationId}`);
    if (typeof acknowledge === 'function') acknowledge({ allowed });
  });
  socket.on('leaveSupplierConversation', conversationId => {
    socket.leave(`supplier_conversation_${conversationId}`);
  });
};

module.exports = { assertAccess, getConversation, createOrGetConversation, listConversations,
  listMessages, sendMessage, markRead, canAccessSocketRoom, emitToAuthorizedRoom,
  registerSupplierChatSocketHandlers, contextKey };
