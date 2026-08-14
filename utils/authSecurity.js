const PROFILE_FIELDS = Object.freeze(['firstName', 'lastName', 'phone', 'avatar']);
const ADDRESS_FIELDS = Object.freeze(['street', 'city', 'province', 'barangay', 'state', 'zipCode', 'country']);
const COORDINATE_FIELDS = Object.freeze(['lat', 'lng']);

const copyDefined = (source, fields) => Object.fromEntries(
  fields
    .filter(field => source?.[field] !== undefined)
    .map(field => [field, source[field]])
);

const pickProfileUpdates = (body = {}) => {
  const updates = copyDefined(body, PROFILE_FIELDS);

  if (body.address && typeof body.address === 'object' && !Array.isArray(body.address)) {
    const address = copyDefined(body.address, ADDRESS_FIELDS);
    if (body.address.coordinates && typeof body.address.coordinates === 'object' && !Array.isArray(body.address.coordinates)) {
      const coordinates = copyDefined(body.address.coordinates, COORDINATE_FIELDS);
      if (Object.keys(coordinates).length) address.coordinates = coordinates;
    }
    if (Object.keys(address).length) updates.address = address;
  }

  return updates;
};

const applyProfileUpdates = (user, updates) => {
  for (const field of PROFILE_FIELDS) {
    if (updates[field] !== undefined) user[field] = updates[field];
  }

  if (updates.address) {
    const existing = user.address?.toObject ? user.address.toObject() : (user.address || {});
    user.address = {
      ...existing,
      ...updates.address,
      coordinates: updates.address.coordinates
        ? { ...(existing.coordinates || {}), ...updates.address.coordinates }
        : existing.coordinates
    };
  }

  return user;
};

const sanitizeUser = (user) => {
  if (!user) return null;
  const safe = user.toObject ? user.toObject() : { ...user };
  delete safe.password;
  delete safe.twoFactorSecret;
  delete safe.__v;
  return safe;
};

const buildPublicRegistrationData = (data) => ({
  username: data.username,
  email: data.email,
  password: data.password,
  firstName: data.firstName,
  lastName: data.lastName,
  phone: data.phone,
  address: data.address,
  role: 'customer'
});

module.exports = {
  PROFILE_FIELDS,
  ADDRESS_FIELDS,
  COORDINATE_FIELDS,
  pickProfileUpdates,
  applyProfileUpdates,
  sanitizeUser,
  buildPublicRegistrationData
};
