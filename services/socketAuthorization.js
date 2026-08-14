const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Delivery = require('../models/Delivery');
const Conversation = require('../models/Conversation');
const Order = require('../models/Order');
const Booking = require('../models/Booking');
const { isPlatformAdmin, isStoreAdmin, isOperationalStaff } = require('../config/permissions');
const { canAccessStore, idsEqual } = require('../utils/authorizationPolicy');
const { canAccessConversation } = require('../utils/conversationAuthorization');
const { attachStoreRolePolicy } = require('./rolePermissionService');

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
      await attachStoreRolePolicy(user);
      socket.user = user;
      return next();
    }
    if (deliveryToken) {
      const delivery = await Delivery.findOne({
        isLive: true,
        $or: [{ riderToken: deliveryToken }, { trackingToken: deliveryToken }]
      }).select('_id riderToken trackingToken isRiderVerified assignedRider');
      if (!delivery) return next(new Error('Delivery capability is invalid or expired'));
      socket.deliveryCapability = {
        deliveryId: String(delivery._id),
        kind: delivery.riderToken === deliveryToken ? 'rider' : 'customer',
        token: deliveryToken,
        assignedRider: delivery.assignedRider
      };
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
  if (socket.deliveryCapability) {
    if (socket.deliveryCapability.deliveryId !== String(deliveryId)) return false;
    if (!mutate) return true;
    if (socket.deliveryCapability.kind !== 'rider') return false;
    return Boolean(await Delivery.exists({
      _id: deliveryId,
      riderToken: socket.deliveryCapability.token,
      isLive: true,
      isRiderVerified: true
    }));
  }
  if (!socket.user) return false;
  const relationship = await getDeliveryRelationship(deliveryId);
  if (!relationship) return false;
  if (isPlatformAdmin(socket.user)) return true;
  if (idsEqual(relationship.customer, socket.user._id)) return !mutate;
  if (idsEqual(relationship.delivery.assignedRider, socket.user._id)) return true;
  if (!relationship.store || !(await canAccessStore(socket.user, relationship.store))) return false;
  return isStoreAdmin(socket.user) || isOperationalStaff(socket.user);
};

const canAccessConversationRoom = async (socket, conversationId) => {
  if (!socket.user || !conversationId) return false;
  const conversation = await Conversation.findById(conversationId);
  return conversation ? canAccessConversation(socket.user, conversation) : false;
};

const deriveDeliverySender = socket => socket.deliveryCapability?.kind
  || (socket.user?.role === 'customer' ? 'customer' : 'rider');

module.exports = {
  socketCredentials,
  authenticateSocket,
  canAccessDeliveryRoom,
  canAccessConversationRoom,
  deriveDeliverySender
};
