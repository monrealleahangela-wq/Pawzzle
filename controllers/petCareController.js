const Booking = require('../models/Booking');
const PetProfile = require('../models/PetProfile');
const MedicalEncounter = require('../models/MedicalEncounter');
const VaccinationRecord = require('../models/VaccinationRecord');
const PetServiceUpdate = require('../models/PetServiceUpdate');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const DogCertification = require('../models/DogCertification');
const InventoryLot = require('../models/InventoryLot');
const InventoryLedgerService = require('../services/inventoryLedgerService');
const { hasPermission } = require('../config/permissions');
const { createNotification } = require('./notificationController');

const ACTIVE_SERVICE_STATES = ['confirmed', 'approved', 'processing', 'finished', 'completed'];
const STAFF_UPDATE_STATES = ['confirmed', 'approved', 'processing', 'finished'];

const bookingStoreId = booking => String(booking.store?._id || booking.store || '');

const loadServiceBooking = async bookingId => Booking.findOne({
  _id: bookingId,
  isDeleted: { $ne: true }
})
  .populate('store', 'name owner')
  .populate('service', 'name category')
  .populate('customer', 'firstName lastName')
  .populate('staff', 'firstName lastName staffType')
  .populate('serviceProvider', 'firstName lastName staffType');

const getBookingAccess = (user, booking) => {
  const userId = String(user._id);
  const ownsBooking = String(booking.customer?._id || booking.customer) === userId;
  const platformAdmin = ['super_admin', 'platform_admin'].includes(user.role);
  const storeOwner = ['admin', 'store_owner'].includes(user.role)
    && String(booking.store?.owner?._id || booking.store?.owner || '') === userId;
  const sameStore = user.store && bookingStoreId(booking) === String(user.store?._id || user.store);
  const assignedStaff = user.role === 'staff' && sameStore && [booking.staff, booking.serviceProvider]
    .some(value => value && String(value?._id || value) === userId);
  const storeManager = user.role === 'staff' && sameStore && hasPermission(user, 'bookings.manage');
  return {
    canView: ownsBooking || platformAdmin || storeOwner || assignedStaff || storeManager,
    canPostStaffUpdate: !platformAdmin && (storeOwner || assignedStaff || storeManager),
    canMessage: ownsBooking || storeOwner || assignedStaff || storeManager,
    isCustomer: ownsBooking,
    canViewInternal: storeOwner || assignedStaff || storeManager || platformAdmin
  };
};

const participantRole = user => ['customer', 'admin', 'staff', 'store_owner', 'super_admin', 'platform_admin'].includes(user.role)
  ? user.role
  : 'staff';

const ensureServiceConversation = async (booking, actor) => {
  let conversation = booking.serviceConversation
    ? await Conversation.findById(booking.serviceConversation)
    : await Conversation.findOne({ booking: booking._id, type: 'service', isDeleted: false });

  const participantCandidates = [
    { user: booking.customer?._id || booking.customer, role: 'customer' },
    booking.staff ? { user: booking.staff?._id || booking.staff, role: 'staff' } : null,
    booking.serviceProvider ? { user: booking.serviceProvider?._id || booking.serviceProvider, role: 'staff' } : null,
    booking.store?.owner ? { user: booking.store.owner?._id || booking.store.owner, role: 'admin' } : null,
    actor ? { user: actor._id, role: participantRole(actor) } : null
  ].filter(Boolean);
  const participants = [];
  const seen = new Set();
  for (const participant of participantCandidates) {
    const key = String(participant.user);
    if (!seen.has(key)) {
      seen.add(key);
      participants.push(participant);
    }
  }

  if (!conversation) {
    try {
      conversation = await Conversation.create({
        participants,
        booking: booking._id,
        service: booking.service?._id || booking.service,
        petProfile: booking.petProfile || null,
        store: booking.store?._id || booking.store,
        type: 'service',
        status: 'active'
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      conversation = await Conversation.findOne({ booking: booking._id, type: 'service' });
    }
  } else {
    const existing = new Set(conversation.participants.map(item => String(item.user)));
    participants.forEach(item => {
      if (!existing.has(String(item.user))) conversation.participants.push(item);
    });
    if (conversation.isModified('participants')) await conversation.save();
  }

  if (String(booking.serviceConversation || '') !== String(conversation._id)) {
    await Booking.findByIdAndUpdate(booking._id, { serviceConversation: conversation._id });
  }
  return conversation;
};

const normalizeLegacyStage = stage => ({
  admitted: 'pet_arrived', started: 'service_started', ready: 'ready_for_pickup', released: 'completed'
}[stage] || stage);

const progressTimeline = booking => {
  const progress = booking.serviceProgress || {};
  const events = [];
  const push = (stage, timestamp, message) => timestamp && events.push({
    id: `progress-${stage}`,
    entryType: 'status', visibility: 'customer', stage, message,
    createdAt: timestamp, sender: null
  });
  if (booking.paymentStatus === 'paid') push('scheduled', progress.scheduledAt || booking.lifecycle?.confirmedAt || booking.paymentDetails?.transactionDate, 'Booking confirmed and scheduled.');
  push('pet_arrived', progress.arrivedAt || booking.scannedAt, 'Your pet has arrived and was checked in.');
  push('service_started', progress.startedAt, 'Your pet\'s service has started.');
  push('ready_for_pickup', progress.readyAt, 'Your pet is ready for pickup.');
  push('completed', progress.completedAt || booking.lifecycle?.completedAt, 'Your pet\'s service has been completed.');
  push('cancelled', progress.cancelledAt || booking.lifecycle?.cancelledAt, 'This service was cancelled.');
  return events;
};

const assertPetAccess = async (req, petId) => {
  const pet = await PetProfile.findById(petId);
  if (!pet) throw new Error('Pet not found.');
  const isOwner = pet.owner?.toString() === req.user._id.toString();
  const isSameStore = req.user.store && pet.homeStore
    && pet.homeStore.toString() === req.user.store.toString();
  let hasAssignedBooking = false;
  if (!isOwner && !isSameStore && req.user.store && req.body?.booking) {
    hasAssignedBooking = Boolean(await Booking.exists({
      _id: req.body.booking, customer: pet.owner, store: req.user.store,
      $or: [{ staff: req.user._id }, { staff: null }]
    }));
  }
  const isPlatformAdmin = ['super_admin', 'platform_admin'].includes(req.user.role);
  const clinicalAccess = hasPermission(req.user, 'clinical.manage') && (isSameStore || hasAssignedBooking);
  if (!isOwner && !clinicalAccess && !isPlatformAdmin) {
    const error = new Error('Access denied to this pet record.');
    error.status = 403;
    throw error;
  }
  return pet;
};

const createEncounter = async (req, res) => {
  try {
    const pet = await assertPetAccess(req, req.params.petId);
    const encounter = await MedicalEncounter.create({
      ...req.body, pet: pet._id, store: req.user.store || pet.store,
      veterinarian: req.user._id, createdBy: req.user._id
    });
    res.status(201).json(encounter);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
};

const getMedicalHistory = async (req, res) => {
  try {
    await assertPetAccess(req, req.params.petId);
    const [encounters, vaccinations] = await Promise.all([
      MedicalEncounter.find({ pet: req.params.petId }).populate('veterinarian', 'firstName lastName').sort({ encounterDate: -1 }),
      VaccinationRecord.find({ pet: req.params.petId }).populate('veterinarian', 'firstName lastName').sort({ administeredAt: -1 })
    ]);
    res.json({ encounters, vaccinations });
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
};

const administerVaccine = async (req, res) => {
  try {
    const pet = await assertPetAccess(req, req.params.petId);
    const lot = await InventoryLot.findOne({
      _id: req.body.inventoryLotId, store: req.user.store || pet.store,
      isVaccine: true, status: 'available', quantityAvailable: { $gte: 1 },
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }]
    });
    if (!lot) return res.status(400).json({ message: 'A valid, available, unexpired vaccine lot is required.' });
    const record = await VaccinationRecord.create({
      ...req.body, pet: pet._id, store: lot.store, veterinarian: req.user._id,
      inventoryLot: lot._id, lotNumberSnapshot: lot.lotNumber,
      manufacturerSnapshot: lot.manufacturer, createdBy: req.user._id
    });
    try {
      await InventoryLedgerService.issueFromLot({
        store: lot.store, product: lot.product, lotId: lot._id,
        quantity: 1, type: 'service_use',
        referenceType: 'VaccinationRecord', referenceId: record._id,
        performedBy: req.user._id, reason: `Vaccine administered to pet ${pet._id}`
      });
    } catch (inventoryError) {
      await VaccinationRecord.findByIdAndDelete(record._id);
      throw inventoryError;
    }
    res.status(201).json(record);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
};

const addServiceUpdate = async (req, res) => {
  try {
    const booking = await loadServiceBooking(req.params.bookingId);
    if (!booking) return res.status(404).json({ message: 'Booking not found.' });
    const access = getBookingAccess(req.user, booking);
    if (!access.canPostStaffUpdate) return res.status(403).json({ message: 'Only the assigned service team or store owner can post service updates.' });
    if (!STAFF_UPDATE_STATES.includes(booking.status)) return res.status(409).json({ message: 'Service updates are only available for active, paid services.' });
    const entryType = req.body.entryType === 'internal_note' ? 'internal_note' : 'update';
    const visibility = entryType === 'internal_note' ? 'internal' : 'customer';
    const message = String(req.body.message || '').trim();
    if (!message) return res.status(400).json({ message: 'Enter an update or note before sending.' });
    const update = await PetServiceUpdate.create({
      booking: booking._id,
      pet: booking.petProfile || null,
      petSnapshot: { name: booking.pet.name, type: booking.pet.type },
      customer: booking.customer._id,
      store: booking.store._id,
      entryType,
      visibility,
      category: ['general', 'observation', 'follow_up', 'pickup', 'incident'].includes(req.body.category) ? req.body.category : 'general',
      stage: normalizeLegacyStage(req.body.stage || booking.serviceProgress?.status || 'general'),
      message,
      createdBy: req.user._id
    });
    let notificationDelivered = true;
    if (visibility === 'customer') {
      const title = update.category === 'follow_up' ? 'Follow-up Information' : update.category === 'pickup' ? 'Pickup Update' : 'Service Update';
      const notification = await createNotification({
        recipient: booking.customer._id,
        sender: req.user._id,
        type: 'service_update',
        title,
        message: message.length > 120 ? `${message.slice(0, 117)}...` : message,
        relatedId: booking._id,
        relatedModel: 'Booking',
        targetUrl: `/bookings?id=${booking._id}`
      });
      notificationDelivered = Boolean(notification);
    }
    await update.populate('createdBy', 'firstName lastName role staffType avatar');
    res.status(201).json({ ...update.toObject(), update, notificationDelivered });
  } catch (error) {
    res.status(error.name === 'ValidationError' ? 400 : 500).json({ message: error.message || 'Unable to send the service update.' });
  }
};

const getServiceUpdates = async (req, res) => {
  try {
    const booking = await loadServiceBooking(req.params.bookingId);
    if (!booking) return res.status(404).json({ message: 'Booking not found.' });
    const access = getBookingAccess(req.user, booking);
    if (!access.canView) return res.status(403).json({ message: 'Access denied.' });
    const filter = { booking: booking._id };
    if (!access.canViewInternal) filter.visibility = 'customer';
    const updates = await PetServiceUpdate.find(filter)
      .populate('createdBy', 'firstName lastName role staffType avatar')
      .sort({ createdAt: 1 });
    res.json({ updates });
  } catch (error) {
    res.status(error.name === 'CastError' ? 404 : 500).json({ message: error.name === 'CastError' ? 'Booking not found.' : 'Unable to load service updates.' });
  }
};

const authorizeServicePhotoUpload = async (req, res, next) => {
  try {
    const booking = await loadServiceBooking(req.params.bookingId);
    if (!booking) return res.status(404).json({ message: 'Booking not found.' });
    const access = getBookingAccess(req.user, booking);
    if (!access.canPostStaffUpdate) return res.status(403).json({ message: 'Only the assigned service team or store owner can upload service photos.' });
    if (!STAFF_UPDATE_STATES.includes(booking.status)) return res.status(409).json({ message: 'Photos can only be added while the paid service is active.' });
    req.serviceBooking = booking;
    next();
  } catch (error) {
    res.status(error.name === 'CastError' ? 404 : 500).json({ message: error.name === 'CastError' ? 'Booking not found.' : 'Unable to authorize this upload.' });
  }
};

const uploadServicePhoto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Choose a supported image to upload.' });
    const booking = req.serviceBooking;
    const category = ['before', 'during', 'after', 'result', 'documentation', 'other'].includes(req.body.category)
      ? req.body.category : 'other';
    const update = await PetServiceUpdate.create({
      booking: booking._id,
      pet: booking.petProfile || null,
      petSnapshot: { name: booking.pet.name, type: booking.pet.type },
      customer: booking.customer._id,
      store: booking.store._id,
      entryType: 'photo',
      visibility: 'customer',
      category: 'general',
      stage: booking.serviceProgress?.status || (booking.status === 'finished' ? 'ready_for_pickup' : 'in_progress'),
      message: String(req.body.message || '').trim(),
      mediaUrls: [req.file.path],
      media: [{
        url: req.file.path,
        publicId: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        category
      }],
      createdBy: req.user._id
    });
    await Booking.findByIdAndUpdate(booking._id, { $addToSet: { servicePhotos: req.file.path } });
    const notification = await createNotification({
      recipient: booking.customer._id,
      sender: req.user._id,
      type: 'service_update',
      title: 'New Service Photo',
      message: `${booking.pet.name} has a new ${category.replace('_', ' ')} service photo.`,
      relatedId: booking._id,
      relatedModel: 'Booking',
      targetUrl: `/bookings?id=${booking._id}`
    });
    await update.populate('createdBy', 'firstName lastName role staffType avatar');
    res.status(201).json({ message: 'Photo shared with the pet owner.', update, notificationDelivered: Boolean(notification) });
  } catch (error) {
    res.status(error.name === 'ValidationError' ? 400 : 500).json({ message: error.message || 'Photo upload failed. Please retry.' });
  }
};

const getServiceTimeline = async (req, res) => {
  try {
    const booking = await loadServiceBooking(req.params.bookingId);
    if (!booking) return res.status(404).json({ message: 'Booking not found.' });
    const access = getBookingAccess(req.user, booking);
    if (!access.canView) return res.status(403).json({ message: 'Access denied.' });
    const updateFilter = { booking: booking._id };
    if (!access.canViewInternal) updateFilter.visibility = 'customer';
    const [updates, conversation] = await Promise.all([
      PetServiceUpdate.find(updateFilter).populate('createdBy', 'firstName lastName role staffType avatar').lean(),
      Conversation.findOne({ booking: booking._id, type: 'service', isDeleted: false }).lean()
    ]);
    const messages = conversation
      ? await Message.find({ conversation: conversation._id, isDeleted: { $ne: true } })
        .populate('sender', 'firstName lastName role staffType avatar').sort({ createdAt: 1 }).lean()
      : [];
    const recordedPhotoUrls = new Set(updates.flatMap(update => [
      ...(update.mediaUrls || []),
      ...(update.media || []).map(media => media.url)
    ]));
    const legacyPhotos = (booking.servicePhotos || [])
      .filter(url => !recordedPhotoUrls.has(url))
      .map((url, index) => ({
        id: `legacy-photo-${index}`,
        entryType: 'photo',
        visibility: 'customer',
        stage: booking.status === 'completed' ? 'completed' : 'in_progress',
        message: 'Service photo',
        mediaUrls: [url],
        createdAt: booking.updatedAt || booking.createdAt,
        sender: booking.serviceProvider || booking.staff
      }));
    const timeline = [
      ...progressTimeline(booking),
      ...legacyPhotos,
      ...updates.map(update => ({
        ...update,
        id: update._id,
        stage: normalizeLegacyStage(update.stage),
        sender: update.createdBy
      })),
      ...messages.map(message => ({
        id: message._id,
        entryType: 'message',
        visibility: 'customer',
        stage: booking.serviceProgress?.status || 'general',
        message: message.content,
        mediaUrls: message.type === 'image' ? [message.content] : [],
        createdAt: message.createdAt,
        sender: message.sender
      }))
    ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    if (access.isCustomer) {
      await Promise.all([
        PetServiceUpdate.updateMany({ booking: booking._id, visibility: 'customer', readAt: null }, { readAt: new Date() }),
        conversation ? Message.updateMany({ conversation: conversation._id, sender: { $ne: req.user._id }, read: false }, { read: true }) : null
      ].filter(Boolean));
    }
    res.json({
      timeline,
      permissions: { canPostStaffUpdate: access.canPostStaffUpdate, canMessage: access.canMessage, canViewInternal: access.canViewInternal },
      summary: {
        pet: booking.pet,
        service: booking.service,
        staff: booking.serviceProvider || booking.staff,
        store: booking.store,
        status: booking.serviceProgress?.status || 'scheduled',
        completedAt: booking.serviceProgress?.completedAt || booking.lifecycle?.completedAt || null
      }
    });
  } catch (error) {
    res.status(error.name === 'CastError' ? 404 : 500).json({ message: error.name === 'CastError' ? 'Booking not found.' : 'Unable to load the service timeline.' });
  }
};

const sendServiceMessage = async (req, res) => {
  try {
    const booking = await loadServiceBooking(req.params.bookingId);
    if (!booking) return res.status(404).json({ message: 'Booking not found.' });
    const access = getBookingAccess(req.user, booking);
    if (!access.canMessage) return res.status(403).json({ message: 'You are not authorized to message about this service.' });
    if (!ACTIVE_SERVICE_STATES.includes(booking.status)) return res.status(409).json({ message: 'Service messaging is available after a paid booking is confirmed.' });
    const content = String(req.body.message || '').trim();
    if (!content) return res.status(400).json({ message: 'Enter a message before sending.' });
    if (content.length > 2000) return res.status(400).json({ message: 'Messages must be 2,000 characters or fewer.' });
    const conversation = await ensureServiceConversation(booking, req.user);
    const message = await Message.create({ conversation: conversation._id, sender: req.user._id, content, type: 'text' });
    await message.populate('sender', 'firstName lastName role staffType avatar');
    const recipients = access.isCustomer
      ? [booking.serviceProvider?._id || booking.serviceProvider, booking.staff?._id || booking.staff, booking.store?.owner?._id || booking.store?.owner]
      : [booking.customer?._id || booking.customer];
    let notificationFailureCount = 0;
    for (const recipient of [...new Set(recipients.filter(Boolean).map(String))]) {
      if (recipient === String(req.user._id)) continue;
      const notification = await createNotification({
        recipient,
        sender: req.user._id,
        type: 'chat_message',
        title: `Service message about ${booking.pet.name}`,
        message: content.length > 100 ? `${content.slice(0, 97)}...` : content,
        relatedId: booking._id,
        relatedModel: 'Booking',
        targetUrl: access.isCustomer ? `/admin/bookings?id=${booking._id}` : `/bookings?id=${booking._id}`
      });
      if (!notification) notificationFailureCount += 1;
    }
    const io = req.app.get('socketio');
    if (io) io.to(`conversation_${conversation._id}`).emit('newMessage', message);
    res.status(201).json({ message, notificationDelivered: notificationFailureCount === 0 });
  } catch (error) {
    res.status(error.name === 'ValidationError' ? 400 : 500).json({ message: error.message || 'Message failed to send. Please retry.' });
  }
};

const createCertification = async (req, res) => {
  try {
    const pet = await assertPetAccess(req, req.params.petId);
    const certification = await DogCertification.create({
      ...req.body, pet: pet._id, owner: pet.owner,
      verificationStatus: req.body.documentUrls?.length ? 'submitted' : 'unsubmitted'
    });
    res.status(201).json(certification);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
};

module.exports = {
  createEncounter, getMedicalHistory, administerVaccine,
  addServiceUpdate, getServiceUpdates, getServiceTimeline, sendServiceMessage,
  authorizeServicePhotoUpload, uploadServicePhoto, createCertification,
  __test: { getBookingAccess, progressTimeline, normalizeLegacyStage }
};
