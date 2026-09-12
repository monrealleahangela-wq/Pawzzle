const asObject = value => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : null
);

const asString = value => (
  typeof value === 'string' ? value.trim() : ''
);

const asFiniteNumber = value => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const normalizeReference = (value, fallbackName) => {
  const object = asObject(value);
  if (object) {
    return {
      ...object,
      _id: asString(object._id) || asString(object.id),
      name: asString(object.name) || fallbackName
    };
  }

  const id = asString(value);
  return id ? { _id: id, name: fallbackName } : null;
};

export const normalizeServiceDetail = payload => {
  const source = asObject(payload?.service) || asObject(payload);
  if (!source) return null;

  const durationSource = asObject(source.duration)?.value ?? source.duration;
  const categorySource = asObject(source.category);
  const images = Array.isArray(source.images)
    ? source.images.filter(Boolean)
    : (asString(source.image) ? [source.image] : []);

  return {
    ...source,
    _id: asString(source._id) || asString(source.id),
    name: asString(source.name) || asString(source.title) || 'Service information unavailable',
    description: asString(source.description),
    category: asString(categorySource?.name)
      || asString(categorySource?.label)
      || asString(source.category)
      || asString(source.type)
      || 'other',
    price: asFiniteNumber(source.price ?? source.basePrice),
    duration: asFiniteNumber(durationSource),
    images,
    store: normalizeReference(source.store, 'Store information unavailable'),
    assignedStaff: Array.isArray(source.assignedStaff) ? source.assignedStaff.filter(Boolean) : [],
    addOns: Array.isArray(source.addOns) ? source.addOns.filter(Boolean) : [],
    requirements: Array.isArray(source.requirements)
      ? source.requirements.filter(Boolean).map(String)
      : asString(source.requirements).split(',').map(item => item.trim()).filter(Boolean),
    isActive: source.isActive !== false,
    isDeleted: source.isDeleted === true
  };
};

export const normalizeBookingRecord = record => {
  const source = asObject(record);
  if (!source) return null;

  const service = normalizeReference(source.service, 'Service unavailable');
  const store = normalizeReference(source.store, 'Store unavailable');
  const pet = asObject(source.pet) || {};
  const legacyPayment = asObject(source.payment);
  const id = asString(source._id) || asString(source.id);

  return {
    ...source,
    _id: id,
    service,
    store,
    pet: {
      ...pet,
      name: asString(pet.name) || 'Pet information unavailable',
      type: asString(pet.type) || asString(pet.species) || 'Not recorded',
      breed: asString(pet.breed) || 'Not recorded'
    },
    bookingDate: source.bookingDate || null,
    startTime: asString(source.startTime),
    endTime: asString(source.endTime),
    status: asString(source.status) || 'unknown',
    paymentStatus: asString(source.paymentStatus)
      || asString(legacyPayment?.status)
      || asString(legacyPayment?.paymentStatus)
      || 'unavailable'
  };
};

export const normalizeBookingCollection = value => (
  Array.isArray(value) ? value.map(normalizeBookingRecord).filter(Boolean) : []
);

export const formatSafeDate = (value, options, fallback = 'Date unavailable') => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString(undefined, options);
};

export const formatRecordId = value => {
  const id = asString(value);
  return id ? id.slice(-12).toUpperCase() : 'UNAVAILABLE';
};
