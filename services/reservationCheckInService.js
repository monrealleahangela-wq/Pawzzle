const crypto = require('crypto');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Store = require('../models/Store');
const Service = require('../models/Service');
const User = require('../models/User');
const ReservationCredential = require('../models/ReservationCredential');
const ReservationCheckInEvent = require('../models/ReservationCheckInEvent');
const { isStoreAdmin, isOperationalStaff, isPlatformAdmin, hasPermission } = require('../config/permissions');
const { getCustomerVisibleOwnerIds, buildCustomerVisibleStoreFilter, withCustomerComplianceFilter } = require('../utils/storeVisibility');
const { getStaffSpecializationRole, isRoleEligibleForService, isProfessionallyAssignable, isActiveStaffAccount } = require('../utils/staffSpecialization');
const {
  QR_PREFIX, getMasterKey, digestSecret, encryptSecret, decryptSecret,
  generateCredentials, normalizeBackupCode, bookingFingerprint, getWindowState
} = require('../utils/reservationCheckIn');

const genericInvalid = () => Object.assign(new Error('The verification code is invalid or unavailable.'), { statusCode: 404, code: 'CREDENTIAL_INVALID' });
const unavailable = () => Object.assign(new Error('Reservation verification is temporarily unavailable.'), { statusCode: 503, code: 'RESERVATION_UNAVAILABLE' });

const objectId = value => String(value?._id || value || '');

const mayManageBooking = (user, booking) => {
  const storeId = objectId(booking.store);
  if (isPlatformAdmin(user)) return hasPermission(user, 'bookings.manage') || hasPermission(user, 'bookings.update');
  if (isStoreAdmin(user)) return Boolean(storeId && objectId(booking.store?.owner) === objectId(user._id));
  if (!isOperationalStaff(user) || isStoreAdmin(user)) return false;
  if (objectId(user.store) !== storeId) return false;
  if (hasPermission(user, 'bookings.manage')) return true;
  return hasPermission(user, 'bookings.update') && objectId(booking.staff) === objectId(user._id);
};

const storeAndBookingAreEligible = async (booking, session) => {
  if (!booking || !booking.staff || !['confirmed', 'approved'].includes(booking.status) || booking.paymentStatus !== 'paid'
      || booking.isDeleted || booking.isScanned || booking.checkedInAt || booking.serviceProgress?.status === 'pet_arrived') return false;
  const storeId = objectId(booking.store);
  const serviceId = objectId(booking.service);
  const service = await Service.findOne({ _id: serviceId, store: storeId, isActive: true, isDeleted: { $ne: true } }).session(session || null);
  if (!service || !service.assignedStaff?.some(id => objectId(id) === objectId(booking.staff))) return false;
  const owners = await getCustomerVisibleOwnerIds();
  const store = await Store.findOne(withCustomerComplianceFilter(buildCustomerVisibleStoreFilter(owners, { _id: storeId })))
    .session(session || null).select('_id owner name isActive isDeleted verificationStatus hrSettings.timezone');
  if (!store) return false;
  const staff = await User.findOne({
    _id: objectId(booking.staff), store: storeId, isActive: { $ne: false }, isDeleted: { $ne: true },
    staffStatus: { $nin: ['inactive', 'suspended', 'archived'] }
  }).session(session || null);
  return Boolean(staff && isActiveStaffAccount(staff) && isProfessionallyAssignable(staff)
    && isRoleEligibleForService(getStaffSpecializationRole(staff), service));
};

const loadBookingContext = async (bookingId, session) => {
  let query = Booking.findById(bookingId).populate('store', 'name owner isActive isDeleted verificationStatus hrSettings.timezone')
    .populate('service', 'name store assignedStaff isActive isDeleted').populate('staff', 'firstName lastName store role staffType isActive isDeleted')
    .populate('customer', 'firstName lastName');
  if (session) query = query.session(session);
  const booking = await query;
  return booking;
};

const issueForBooking = async bookingId => {
  let master;
  try { master = getMasterKey(); } catch (error) { throw unavailable(); }
  const booking = await loadBookingContext(bookingId);
  if (!booking || !await storeAndBookingAreEligible(booking)) return { eligible: false, state: 'unavailable' };
  const fingerprint = bookingFingerprint(booking);
  const existing = await ReservationCredential.findOne({ booking: booking._id, revisionFingerprint: fingerprint, active: true })
    .select('+qrDigest +backupDigest +encryptedQr +encryptedBackup');
  if (existing) {
    try {
      return {
        eligible: true,
        credential: { qrToken: decryptSecret(existing.encryptedQr, master), backupCode: decryptSecret(existing.encryptedBackup, master) },
        issuedAt: existing.issuedAt,
        rotated: Number(existing.version || 1) > 1
      };
    } catch (error) { throw unavailable(); }
  }

  const version = (await ReservationCredential.countDocuments({ booking: booking._id })) + 1;
  const rotated = version > 1;
  const generated = generateCredentials();
  const now = new Date();
  const values = {
    booking: booking._id,
    store: objectId(booking.store),
    revisionFingerprint: fingerprint,
    version,
    qrDigest: digestSecret(generated.qrToken, 'qr', master),
    backupDigest: digestSecret(normalizeBackupCode(generated.backupCode), 'backup', master),
    encryptedQr: encryptSecret(generated.qrToken, master),
    encryptedBackup: encryptSecret(generated.backupCode, master),
    active: true,
    issuedAt: now
  };
  let credential;
  try {
    credential = await ReservationCredential.findOneAndUpdate(
      { booking: booking._id, revisionFingerprint: fingerprint },
      { $setOnInsert: values },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).select('+qrDigest +backupDigest +encryptedQr +encryptedBackup');
  } catch (error) {
    if (error.code !== 11000) throw error;
    credential = await ReservationCredential.findOne({ booking: booking._id, revisionFingerprint: fingerprint, active: true })
      .select('+qrDigest +backupDigest +encryptedQr +encryptedBackup');
  }
  if (!credential) throw unavailable();
  await ReservationCredential.updateMany({ booking: booking._id, _id: { $ne: credential._id }, active: true }, {
    $set: { active: false, revokedAt: now }
  });
  try {
    return {
      eligible: true,
      credential: { qrToken: decryptSecret(credential.encryptedQr, master), backupCode: decryptSecret(credential.encryptedBackup, master) },
        issuedAt: credential.issuedAt,
        rotated
    };
  } catch (error) { throw unavailable(); }
};

const revokeForBooking = async (bookingId, session) => ReservationCredential.updateMany(
  { booking: bookingId, active: true }, { $set: { active: false, revokedAt: new Date() } }, session ? { session } : {}
);

const readCredentialRecord = async (secret, method, master) => {
  const normalized = method === 'backup_code' ? normalizeBackupCode(secret) : String(secret || '').trim();
  if (!normalized || normalized.length > 80
      || (method === 'qr' && !/^PZQ1\.[A-Za-z0-9_-]{43}$/.test(normalized))
      || (method === 'backup_code' && !/^[A-HJ-NP-Z2-9]{16}$/.test(normalized))) return null;
  const digest = digestSecret(normalized, method === 'backup_code' ? 'backup' : 'qr', master);
  const field = method === 'backup_code' ? 'backupDigest' : 'qrDigest';
  const record = await ReservationCredential.findOne({ [field]: digest }).select('+qrDigest +backupDigest');
  if (!record) return null;
  const expected = Buffer.from(record[field], 'hex');
  const supplied = Buffer.from(digest, 'hex');
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied) ? { record, normalized } : null;
};

const validateCredential = async ({ secret, method, actor, now = new Date(), writeAudit = true, expectedBookingId }) => {
  if (!['qr', 'backup_code'].includes(method)) throw Object.assign(new Error('Choose QR or backup-code verification.'), { statusCode: 400 });
  let master;
  try { master = getMasterKey(); } catch (error) { throw unavailable(); }
  const match = await readCredentialRecord(secret, method, master);
  if (!match) throw genericInvalid();
  const { record } = match;
  const booking = await loadBookingContext(record.booking);
  if (!booking || !mayManageBooking(actor, booking)) throw genericInvalid();
  if (expectedBookingId && objectId(booking._id) !== objectId(expectedBookingId)) throw genericInvalid();
  const currentFingerprint = bookingFingerprint(booking);
  let windowState = getWindowState(booking, now, booking.store?.hrSettings?.timezone || 'Asia/Manila');
  if (record.revisionFingerprint !== currentFingerprint) windowState = { state: 'unavailable', reason: 'ineligible' };
  else if (!record.active && !['checked_in', 'cancelled'].includes(windowState.state)) windowState = { state: 'unavailable', reason: 'ineligible' };
  else if (windowState.state === 'available' && !await storeAndBookingAreEligible(booking)) {
    windowState = { state: 'unavailable', reason: 'ineligible', window: windowState.window };
  }
  if (writeAudit) await ReservationCheckInEvent.create({
    booking: booking._id, store: objectId(booking.store), actor: actor._id, method,
    outcome: windowState.state === 'available' ? 'verified' : 'rejected',
    ...(windowState.reason ? { reason: windowState.reason } : {}), occurredAt: now
  });
  if (windowState.state !== 'available') {
    const messages = {
      too_early: 'This reservation is not in its check-in window yet.',
      window_expired: 'The reservation check-in window has expired.',
      cancelled: 'This reservation is no longer active.',
      unconfirmed: 'This reservation is not confirmed.',
      payment_required: 'Payment has not been confirmed for this reservation.',
      already_checked_in: 'This reservation has already been checked in.',
      ineligible: 'This reservation verification is no longer valid.'
    };
    throw Object.assign(new Error(messages[windowState.reason] || 'This reservation is not eligible for check-in.'), {
      statusCode: windowState.reason === 'too_early' || windowState.reason === 'window_expired' ? 409 : 409,
      code: windowState.reason,
      state: windowState.state
    });
  }
  return { record, booking, window: windowState.window, method };
};

const getCustomerCredential = async (bookingId, customerId) => {
  const booking = await loadBookingContext(bookingId);
  if (!booking) throw Object.assign(new Error('Booking not found.'), { statusCode: 404 });
  if (objectId(booking.customer) !== objectId(customerId)) throw Object.assign(new Error('Access denied.'), { statusCode: 403 });
  if (booking.isScanned || booking.checkedInAt) return { state: 'checked_in', credential: null };
  if (['cancelled', 'no_show', 'rejected', 'confirmation_expired'].includes(booking.status)) return { state: 'cancelled', credential: null };
  if (!['confirmed', 'approved'].includes(booking.status) || booking.paymentStatus !== 'paid') {
    return { state: 'unconfirmed', credential: null };
  }
  const issued = await issueForBooking(booking._id);
  const windowState = getWindowState(booking, new Date(), booking.store?.hrSettings?.timezone || 'Asia/Manila');
  return { state: issued.eligible ? windowState.state : 'temporarily_unavailable', credential: issued.credential || null, issuedAt: issued.issuedAt || null, rotated: Boolean(issued.rotated) };
};

const verifyCredential = async input => validateCredential({ ...input, writeAudit: true });

const confirmCheckIn = async ({ secret, method, actor, expectedBookingId }) => {
  const validation = await validateCredential({ secret, method, actor, writeAudit: true, expectedBookingId });
  const session = await mongoose.startSession();
  let checkedIn;
  const now = new Date();
  try {
    await session.withTransaction(async () => {
      const credential = await ReservationCredential.findOne({
        _id: validation.record._id, booking: validation.booking._id, active: true,
        revisionFingerprint: validation.record.revisionFingerprint
      }).session(session);
      if (!credential) throw genericInvalid();
      const fresh = await loadBookingContext(validation.booking._id, session);
      if (!fresh || bookingFingerprint(fresh) !== credential.revisionFingerprint
          || !mayManageBooking(actor, fresh)
          || !await storeAndBookingAreEligible(fresh, session)) {
        throw Object.assign(new Error('This reservation is no longer eligible for check-in.'), { statusCode: 409 });
      }
      const state = getWindowState(fresh, now, fresh.store?.hrSettings?.timezone || 'Asia/Manila');
      if (state.state !== 'available') throw Object.assign(new Error(state.state === 'too_early'
        ? 'This reservation is not in its check-in window yet.' : state.state === 'expired'
          ? 'The reservation check-in window has expired.' : 'This reservation is no longer eligible for check-in.'), { statusCode: 409 });

      checkedIn = await Booking.findOneAndUpdate({
        _id: fresh._id, status: { $in: ['confirmed', 'approved'] }, paymentStatus: 'paid',
        isScanned: { $ne: true }, checkedInAt: null, 'serviceProgress.status': { $ne: 'pet_arrived' }
      }, { $set: {
        isScanned: true, scannedAt: now, scannedBy: actor._id,
        checkedInAt: now, checkedInBy: actor._id, checkInMethod: method,
        serviceProvider: fresh.staff,
        'serviceProgress.status': 'pet_arrived', 'serviceProgress.arrivedAt': now
      } }, { new: true, session });
      if (!checkedIn) throw Object.assign(new Error('This reservation has already been checked in or is no longer eligible.'), { statusCode: 409 });
      credential.active = false;
      credential.usedAt = now;
      credential.revokedAt = now;
      await credential.save({ session });
      await ReservationCheckInEvent.create([{
        booking: fresh._id, store: objectId(fresh.store), actor: actor._id,
        method, outcome: 'checked_in', occurredAt: now
      }], { session });
    });
  } catch (error) {
    if (error.code === 'RESERVATION_KEY_UNAVAILABLE') throw unavailable();
    if (error.statusCode) throw error;
    const safe = Object.assign(new Error('Check-in could not be completed. Please retry verification.'), { statusCode: 503 });
    throw safe;
  } finally {
    await session.endSession();
  }
  return checkedIn;
};

module.exports = {
  issueForBooking, getCustomerCredential, verifyCredential, confirmCheckIn,
  revokeForBooking, mayManageBooking, storeAndBookingAreEligible
};
