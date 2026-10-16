const DELIVERY_STATUSES = new Set([
  'pending', 'unassigned', 'assigned', 'accepted', 'declined', 'picked_up',
  'in_transit', 'arrived', 'delivered', 'failed_attempt', 'returned_to_store',
  'cancelled'
]);

const cleanText = (value, maxLength) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text.length > maxLength) {
    const error = new Error(`Value must not exceed ${maxLength} characters.`);
    error.statusCode = 400;
    throw error;
  }
  return text;
};
const optionalCoordinate = value => {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const normalizeManualAddress = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const error = new Error('A complete delivery address is required.');
    error.statusCode = 400;
    throw error;
  }
  const formattedAddress = cleanText(
    value.formattedAddress || value.full || value.address,
    500
  );
  if (formattedAddress.length < 5) {
    const error = new Error('Enter a complete delivery address.');
    error.statusCode = 400;
    throw error;
  }

  const lat = optionalCoordinate(value.coordinates?.lat);
  const lng = optionalCoordinate(value.coordinates?.lng);
  const hasAnyCoordinate = lat !== null || lng !== null;
  const hasValidPair = lat !== null && lng !== null
    && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  if (hasAnyCoordinate && !hasValidPair) {
    const error = new Error('Address coordinates must be a valid latitude and longitude pair.');
    error.statusCode = 400;
    throw error;
  }

  return {
    formattedAddress,
    street: cleanText(value.street, 200),
    barangay: cleanText(value.barangay, 120),
    city: cleanText(value.city, 120),
    province: cleanText(value.province || value.state, 120),
    zipCode: cleanText(value.zipCode || value.postalCode, 20),
    country: cleanText(value.country, 80),
    ...(cleanText(value.placeId || value.place_id, 200)
      ? { placeId: cleanText(value.placeId || value.place_id, 200) }
      : {}),
    ...(hasValidPair ? { coordinates: { lat, lng } } : {})
  };
};

const normalizeManualDelivery = (value, actorId, existing = {}) => {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const recipientName = cleanText(input.recipientName, 160);
  const recipientPhone = cleanText(input.recipientPhone, 40);
  if (recipientName.length < 2) {
    const error = new Error('Recipient name is required.');
    error.statusCode = 400;
    throw error;
  }
  if (recipientPhone.length < 7) {
    const error = new Error('Enter a valid recipient phone number.');
    error.statusCode = 400;
    throw error;
  }
  return {
    recipientName,
    recipientPhone,
    pickupAddress: normalizeManualAddress(input.pickupAddress),
    dropoffAddress: normalizeManualAddress(input.dropoffAddress),
    notes: cleanText(input.notes, 1000),
    idempotencyKey: existing.idempotencyKey || cleanText(input.idempotencyKey, 100),
    createdBy: existing.createdBy || actorId,
    updatedBy: actorId
  };
};

const parseManilaDate = (value, endOfDay = false) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const buildDeliveryQueryFilters = async ({ query, scope, models, escapeRegex }) => {
  const { Order, Booking, User } = models;
  const { status, riderType, rider, search, from, to } = query;
  const filters = [];
  if (status) {
    if (!DELIVERY_STATUSES.has(status)) {
      const error = new Error('Invalid delivery status filter.');
      error.statusCode = 400;
      throw error;
    }
    filters.push({ status });
  }
  if (riderType) {
    if (!['internal', 'unassigned'].includes(riderType)) {
      const error = new Error('Invalid rider type filter.');
      error.statusCode = 400;
      throw error;
    }
    filters.push(riderType === 'internal' ? { assignedRider: { $ne: null } } : { assignedRider: null });
  }
  if (rider) {
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(rider)) {
      const error = new Error('Invalid Rider filter.');
      error.statusCode = 400;
      throw error;
    }
    filters.push({ assignedRider: rider });
  }
  if (from || to) {
    const createdAt = {};
    if (from) {
      const start = parseManilaDate(from);
      if (!start) {
        const error = new Error('Invalid start date filter.');
        error.statusCode = 400;
        throw error;
      }
      createdAt.$gte = start;
    }
    if (to) {
      const end = parseManilaDate(to, true);
      if (!end) {
        const error = new Error('Invalid end date filter.');
        error.statusCode = 400;
        throw error;
      }
      createdAt.$lte = end;
    }
    if (createdAt.$gte && createdAt.$lte && createdAt.$gte > createdAt.$lte) {
      const error = new Error('Start date must be on or before end date.');
      error.statusCode = 400;
      throw error;
    }
    filters.push({ createdAt });
  }

  if (search?.trim()) {
    const pattern = new RegExp(escapeRegex(search.trim()), 'i');
    const customerIds = await User.find({
      $or: [{ firstName: pattern }, { lastName: pattern }, { username: pattern }]
    }).distinct('_id');
    const orderQuery = { $or: [{ orderNumber: pattern }, { trackingNumber: pattern }, { customer: { $in: customerIds } }] };
    const bookingQuery = { customer: { $in: customerIds } };
    if (scope.store) { orderQuery.store = scope.store; bookingQuery.store = scope.store; }
    const [orderIds, bookingIds, riderIds] = await Promise.all([
      Order.find(orderQuery).distinct('_id'),
      Booking.find(bookingQuery).distinct('_id'),
      User.find({ $and: [
        { $or: [{ role: 'delivery_rider' }, { role: 'staff', staffType: 'delivery_rider' }] },
        { $or: [{ firstName: pattern }, { lastName: pattern }, { 'riderProfile.staffId': pattern }] }
      ] }).distinct('_id')
    ]);
    filters.push({
      $or: [
        { trackingToken: pattern }, { order: { $in: orderIds } },
        { booking: { $in: bookingIds } }, { assignedRider: { $in: riderIds } },
        { 'manualDelivery.recipientName': pattern },
        { 'manualDelivery.recipientPhone': pattern },
        { 'manualDelivery.pickupAddress.formattedAddress': pattern },
        { 'manualDelivery.dropoffAddress.formattedAddress': pattern }
      ]
    });
  }

  return filters.length ? { $and: [scope.match, ...filters] } : scope.match;
};

module.exports = {
  DELIVERY_STATUSES,
  buildDeliveryQueryFilters,
  normalizeManualAddress,
  normalizeManualDelivery,
  parseManilaDate
};
