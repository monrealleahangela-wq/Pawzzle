const Booking = require('../models/Booking');
const Pet = require('../models/Pet');
const { isPlatformAdmin, isStoreAdmin, isOperationalStaff, hasPermission } = require('../config/permissions');
const { canAccessStore, idsEqual } = require('./authorizationPolicy');

const participantIds = conversation => (conversation?.participants || []).map(entry => entry.user?._id || entry.user);

const isParticipant = (user, conversation) => participantIds(conversation).some(id => idsEqual(id, user?._id));

const loadRelationship = async conversation => {
  let storeId = conversation?.store?._id || conversation?.store || null;
  let booking = null;
  let pet = null;

  if (conversation?.booking) {
    booking = await Booking.findById(conversation.booking).select('customer store staff serviceProvider isDeleted').lean();
    if (booking && !booking.isDeleted) storeId = booking.store || storeId;
  }
  if (conversation?.pet) {
    pet = await Pet.findById(conversation.pet?._id || conversation.pet).select('store addedBy isDeleted').lean();
    if (pet && !pet.isDeleted) storeId = pet.store || storeId;
  }
  return { storeId, booking, pet };
};

const canAccessConversation = async (user, conversation) => {
  if (!user || !conversation || conversation.isDeleted) return false;
  if (isPlatformAdmin(user)) return true;

  const participant = isParticipant(user, conversation);
  const { storeId, booking } = await loadRelationship(conversation);

  if (conversation.type === 'service') {
    if (!booking) return false;
    if (idsEqual(booking.customer, user._id)) return participant;
    if (!(await canAccessStore(user, storeId))) return false;
    if (isStoreAdmin(user)) return true;
    if (!isOperationalStaff(user)) return false;
    return idsEqual(booking.staff, user._id)
      || idsEqual(booking.serviceProvider, user._id)
      || hasPermission(user, 'bookings.manage');
  }

  if (participant) return true;
  if (!storeId || !(await canAccessStore(user, storeId))) return false;
  return isStoreAdmin(user);
};

const canManageAdoptionConversation = async (user, conversation) => {
  if (!conversation || !['adoption', 'inquiry'].includes(conversation.type)) return false;
  if (isPlatformAdmin(user)) return true;
  const { storeId, pet } = await loadRelationship(conversation);
  if (pet && idsEqual(pet.addedBy, user?._id)) return true;
  return isStoreAdmin(user) && storeId && canAccessStore(user, storeId);
};

const normalizeConversationParticipantRole = user => {
  if (isPlatformAdmin(user)) return user.role === 'platform_admin' ? 'platform_admin' : 'super_admin';
  if (isStoreAdmin(user)) return user.role === 'store_owner' ? 'store_owner' : 'admin';
  if (isOperationalStaff(user)) return 'staff';
  return 'customer';
};

module.exports = {
  isParticipant,
  loadRelationship,
  canAccessConversation,
  canManageAdoptionConversation,
  normalizeConversationParticipantRole
};
