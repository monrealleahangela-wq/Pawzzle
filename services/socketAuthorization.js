const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Delivery = require('../models/Delivery');
const Conversation = require('../models/Conversation');
const Order = require('../models/Order');
const Booking = require('../models/Booking');
const { isPlatformAdmin, isStoreAdmin, isOperationalStaff, hasPermission } = require('../config/permissions');
const { canAccessStore, idsEqual } = require('../utils/authorizationPolicy');
const { canAccessConversation } = require('../utils/conversationAuthorization');
const { attachStoreRolePolicy } = require('./rolePermissionService');
const { requiresPlatformVerification, getProfessionalVerificationStatus } = require('../utils/staffSpecialization');

const socketCredentials = socket => ({
  token: socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, ''),
  deliveryToken: socket.handshake.auth?.deliveryToken
});

const authenticateSocket = async (socket, next) => {
  try {
    const { token, deliveryToken } = socketCredentials(socket);
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      if (!user || !user.isActive || user.isDeleted) return next(new Error('Authentication failed'));
      if (requiresPlatformVerification(user) && getProfessionalVerificationStatus(user) !== 'verified') {
        return next(new Error('Professional verification required'));
      }
      await attachStoreRolePolicy(user);
      socket.user = user;
      socket.data = { ...(socket.data || {}), userId: String(user._id) };
      return next();
    }
    if (deliveryToken) {
      const delivery = await Delivery.findOne({ isLive: true, trackingToken: deliveryToken })
        .select('_id trackingToken assignedRider assignmentType');
      if (!delivery) return next(new Error('Delivery capability is invalid or expired'));
      socket.deliveryCapability = {
        deliveryId: String(delivery._id),
        kind: 'customer',
        token: deliveryToken,
        assignedRider: delivery.assignedRider
      };
      socket.data = { ...(socket.data || {}), deliveryCapability: socket.deliveryCapability };
      return next();
    }
    return next(new Error('Authentication required'));
  } catch (_error) {
    return next(new Error('Authentication failed'));
  }
};

const getDeliveryRelationship = async deliveryId => {
  const delivery = await Delivery.findById(deliveryId).select('store order booking assignedRider isLive');
  if (!delivery) return null;
  let customer = null;
  let store = delivery.store;
  if (delivery.order) {
    const order = await Order.findById(delivery.order).select('customer store');
    customer = order?.customer;
    store = order?.store || store;
  } else if (delivery.booking) {
    const booking = await Booking.findById(delivery.booking).select('customer store');
    customer = booking?.customer;
    store = booking?.store || store;
  }
  return { delivery, customer, store };
};

const canAccessDeliveryRoom = async (socket, deliveryId, { mutate = false } = {}) => {
  if (!deliveryId) return false;
  const capability = socket.deliveryCapability || socket.data?.deliveryCapability;
  if (capability) {
    if (capability.deliveryId !== String(deliveryId) || mutate) return false;
    return Boolean(await Delivery.exists({ _id: deliveryId, trackingToken: capability.token }));
  }
  let user = socket.user;
  if (!user && socket.data?.userId) {
    user = await User.findOne({ _id: socket.data.userId, isActive: true, isDeleted: false }).select('-password');
    if (user) await attachStoreRolePolicy(user);
  }
  if (!user) return false;
  const relationship = await getDeliveryRelationship(deliveryId);
  if (!relationship) return false;
  if (isPlatformAdmin(user)) return true;
  if (idsEqual(relationship.customer, user._id)) return !mutate;
  if (idsEqual(relationship.delivery.assignedRider, user._id)) return true;
  if (!relationship.store || !(await canAccessStore(user, relationship.store))) return false;
  return isStoreAdmin(user) || (isOperationalStaff(user)
    && (hasPermission(user, 'logistics.view') || hasPermission(user, 'logistics.manage')));
};

const revokeDeliveryRoomForUser = async (io, deliveryId, userId) => {
  if (!io || !deliveryId || !userId) return true;
  try {
    const sockets = await io.in(`user_${String(userId)}`).fetchSockets();
    await Promise.all(sockets.map(socket => socket.leave(`delivery_${String(deliveryId)}`)));
    return true;
  } catch (error) {
    console.error('Delivery room revocation error:', error.message);
    return false;
  }
};

const pruneDeliveryRoom = async (io, deliveryId) => {
  if (!io || !deliveryId) return false;
  try {
    const room = `delivery_${String(deliveryId)}`;
    const sockets = await io.in(room).fetchSockets();
    for (const socket of sockets) {
      if (!(await canAccessDeliveryRoom(socket, deliveryId))) await socket.leave(room);
    }
    return true;
  } catch (error) {
    console.error('Delivery room authorization refresh error:', error.message);
    return false;
  }
};

const emitAuthorizedDeliveryEvent = async (io, deliveryId, event, payload) => {
  if (!(await pruneDeliveryRoom(io, deliveryId))) return false;
  io.to(`delivery_${String(deliveryId)}`).emit(event, payload);
  return true;
};

const canAccessConversationRoom = async (socket, conversationId) => {
  if (!socket.user || !conversationId) return false;
  const conversation = await Conversation.findById(conversationId);
  return conversation ? canAccessConversation(socket.user, conversation) : false;
};

module.exports = {
  socketCredentials,
  authenticateSocket,
  canAccessDeliveryRoom,
  canAccessConversationRoom,
  revokeDeliveryRoomForUser,
  pruneDeliveryRoom,
  emitAuthorizedDeliveryEvent
};
