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
const { hasPermission, isOperationalStaff } = require('../config/permissions');
const { createNotification } = require('./notificationController');

const ACTIVE_SERVICE_STATES = ['confirmed', 'approved', 'processing', 'finished', 'completed'];
const STAFF_UPDATE_STATES = ['confirmed', 'approved', 'processing', 'finished'];

const emitServiceUpdate = (req, booking, eventType) => {
  const io = req.app.get('socketio');
  if (!io) return;
  const payload = { bookingId: String(booking._id), eventType, timestamp: new Date() };
  io.to(`user_${String(booking.customer?._id || booking.customer)}`).emit('serviceUpdate', payload);
  io.to(`store_${bookingStoreId(booking)}`).emit('serviceUpdate', payload);
};

const bookingStoreId = booking => String(booking.store?._id || booking.store || '');

const loadServiceBooking = async bookingId => Booking.findOne({
  _id: bookingId,
  isDeleted: { $ne: true }
})
  .populate('store', 'name owner')
  .populate('service', 'name category duration')
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
  const assignedStaff = isOperationalStaff(user) && hasPermission(user, 'bookings.assigned') && sameStore && [booking.staff, booking.serviceProvider]
    .some(value => value && String(value?._id || value) === userId);
  const storeManager = isOperationalStaff(user) && sameStore && hasPermission(user, 'bookings.manage');
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
  const push = (stage, timestamp, message, sender = null) => timestamp && events.push({
    id: `progress-${stage}`,
    entryType: 'status', visibility: 'customer', stage, message,
    createdAt: timestamp, sender
  });
  push('proposal_received', booking.lifecycle?.proposedAt, 'The store prepared a booking proposal and assigned a specialist.');
  push('staff_assigned', booking.lifecycle?.proposedAt, 'Your specialist was assigned for this service.', booking.staff);
  push('proposal_confirmed', booking.lifecycle?.customerConfirmedAt, 'You confirmed the booking proposal.');
  if (booking.paymentStatus === 'paid') {
    const confirmedAt = booking.lifecycle?.confirmedAt || booking.paymentDetails?.transactionDate;
    push('payment_completed', booking.paymentDetails?.transactionDate || confirmedAt, 'PayMongo payment was confirmed.');
    push('booking_confirmed', confirmedAt, `Booking confirmed for ${booking.startTime} at ${booking.store?.name || 'the selected branch'}.`, booking.staff);
  }
  push('pet_arrived', progress.arrivedAt || booking.scannedAt, `${booking.pet?.name || 'Your pet'} checked in at ${booking.store?.name || 'the selected branch'}.`, booking.serviceProvider || booking.staff);
  push('service_started', progress.startedAt, 'Your pet\'s service has started.', booking.serviceProvider || booking.staff);
  push('ready_for_pickup', progress.readyAt, 'Your pet is ready for pickup.', booking.serviceProvider || booking.staff);
  push('completed', progress.completedAt || booking.lifecycle?.completedAt, 'Your pet\'s service has been completed.', booking.serviceProvider || booking.staff);
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
      }, req.app.get('socketio'));
      notificationDelivered = Boolean(notification);
    }
    await update.populate('createdBy', 'firstName lastName role staffType avatar');
    emitServiceUpdate(req, booking, entryType);
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
    const files = [
      ...(req.files?.images || []),
      ...(req.files?.image || []),
      ...(req.file ? [req.file] : [])
    ];
    if (!files.length) return res.status(400).json({ message: 'Choose at least one supported image to upload.' });
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
      mediaUrls: files.map(file => file.path),
      media: files.map(file => ({
        url: file.path,
        publicId: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        category
      })),
      createdBy: req.user._id
    });
    await Booking.findByIdAndUpdate(booking._id, { $addToSet: { servicePhotos: { $each: files.map(file => file.path) } } });
    const notification = await createNotification({
      recipient: booking.customer._id,
      sender: req.user._id,
      type: 'service_update',
      title: 'New Service Photo',
      message: `${booking.pet.name} has ${files.length === 1 ? 'a new' : `${files.length} new`} ${category.replace('_', ' ')} service photo${files.length === 1 ? '' : 's'}.`,
      relatedId: booking._id,
      relatedModel: 'Booking',
      targetUrl: `/bookings?id=${booking._id}`
    }, req.app.get('socketio'));
    await update.populate('createdBy', 'firstName lastName role staffType avatar');
    emitServiceUpdate(req, booking, 'photo');
    res.status(201).json({ message: `${files.length} photo${files.length === 1 ? '' : 's'} shared with the pet owner.`, update, notificationDelivered: Boolean(notification) });
  } catch (error) {
    res.status(error.name === 'ValidationError' ? 400 : 500).json({ message: error.message || 'Photo upload failed. Please retry.' });
  }
};

const saveAftercare = async (req, res) => {
  try {
    const booking = await loadServiceBooking(req.params.bookingId);
    if (!booking) return res.status(404).json({ message: 'Booking not found.' });
    const access = getBookingAccess(req.user, booking);
    if (!access.canPostStaffUpdate) return res.status(403).json({ message: 'Only the assigned service team or store owner can provide aftercare.' });
    if (!['finished', 'completed'].includes(booking.status)) return res.status(409).json({ message: 'Aftercare is available when the service is ready for pickup or completed.' });
    const aftercareInstructions = String(req.body.aftercareInstructions || '').trim();
    const serviceNotes = String(req.body.serviceNotes || '').trim();
    if (!aftercareInstructions) return res.status(400).json({ message: 'Enter aftercare instructions for the pet owner.' });
    if (aftercareInstructions.length > 4000 || serviceNotes.length > 4000) return res.status(400).json({ message: 'Aftercare and service notes must each be 4,000 characters or fewer.' });
    const providedAt = new Date();
    booking.careSummary.aftercareInstructions = aftercareInstructions;
    booking.careSummary.serviceNotes = serviceNotes;
    booking.careSummary.aftercareProvidedAt = providedAt;
    booking.careSummary.aftercareProvidedBy = req.user._id;
    await booking.save();
    const update = await PetServiceUpdate.findOneAndUpdate(
      { booking: booking._id, entryType: 'aftercare', visibility: 'customer' },
      {
        $set: {
          pet: booking.petProfile || null,
          petSnapshot: { name: booking.pet.name, type: booking.pet.type },
          customer: booking.customer._id,
          store: booking.store._id,
          category: 'follow_up',
          stage: 'aftercare',
          message: aftercareInstructions,
          createdBy: req.user._id,
          updatedAt: providedAt
        },
        $setOnInsert: { entryType: 'aftercare', visibility: 'customer', createdAt: providedAt }
      },
      { upsert: true, new: true, runValidators: true }
    ).populate('createdBy', 'firstName lastName role staffType avatar');
    const notification = await createNotification({
      recipient: booking.customer._id,
      sender: req.user._id,
      type: 'service_update',
      title: 'Aftercare Instructions Available',
      message: `Aftercare instructions for ${booking.pet.name} are available in the booking timeline.`,
      relatedId: booking._id,
      relatedModel: 'Booking',
      targetUrl: `/bookings?id=${booking._id}`
    }, req.app.get('socketio'));
    emitServiceUpdate(req, booking, 'aftercare');
    res.json({ message: 'Aftercare instructions shared.', update, careSummary: booking.careSummary, notificationDelivered: Boolean(notification) });
  } catch (error) {
    res.status(error.name === 'ValidationError' ? 400 : 500).json({ message: error.message || 'Unable to save aftercare instructions.' });
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
    const publicUpdates = updates.filter(update => update.visibility === 'customer');
    const photoCount = new Set([
      ...(booking.servicePhotos || []),
      ...publicUpdates.flatMap(update => [
        ...(update.mediaUrls || []),
        ...(update.media || []).map(media => media.url)
      ])
    ]).size;
    const serviceStartedAt = booking.serviceProgress?.startedAt;
    const serviceEndedAt = booking.serviceProgress?.completedAt || booking.serviceProgress?.readyAt;
    const actualDurationMinutes = serviceStartedAt && serviceEndedAt
      ? Math.max(0, Math.round((new Date(serviceEndedAt) - new Date(serviceStartedAt)) / 60000))
      : null;
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
        completedAt: booking.serviceProgress?.completedAt || booking.lifecycle?.completedAt || null,
        serviceSummary: {
          bookingDate: booking.bookingDate,
          startTime: booking.startTime,
          endTime: booking.endTime,
          estimatedDurationMinutes: booking.proposal?.estimatedDurationMinutes || booking.service?.duration || null,
          actualDurationMinutes,
          photoCount,
          notes: booking.careSummary?.serviceNotes || '',
          aftercareInstructions: booking.careSummary?.aftercareInstructions || '',
          aftercareProvidedAt: booking.careSummary?.aftercareProvidedAt || null,
          paymentStatus: booking.paymentStatus,
          paymentMethod: booking.paymentMethod,
          totalPrice: booking.totalPrice,
          pricingBreakdown: booking.pricingBreakdown
        }
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
      }, req.app.get('socketio'));
      if (!notification) notificationFailureCount += 1;
    }
    const io = req.app.get('socketio');
    if (io) io.to(`conversation_${conversation._id}`).emit('newMessage', message);
    emitServiceUpdate(req, booking, 'message');
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
  authorizeServicePhotoUpload, uploadServicePhoto, saveAftercare, createCertification,
  __test: { getBookingAccess, progressTimeline, normalizeLegacyStage }
};
