const splitFullName = value => {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text) return {};
  if (text.includes(',')) {
    const [lastName, remaining = ''] = text.split(',', 2).map(part => part.trim());
    const parts = remaining.split(' ').filter(Boolean);
    return {
      firstName: parts[0] || '',
      middleName: parts.slice(1).join(' '),
      lastName
    };
  }
  const parts = text.split(' ').filter(Boolean);
  if (parts.length < 2) return {};
  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(' '),
    lastName: parts[parts.length - 1]
  };
};

export const mergeGovernmentIdFields = (registration, extracted = {}) => {
  const fromFullName = splitFullName(extracted.fullName);
  const valueOrExisting = (existing, suggested) => existing || suggested || '';
  return {
    ...registration,
    firstName: valueOrExisting(registration.firstName, extracted.firstName || fromFullName.firstName),
    middleName: valueOrExisting(registration.middleName, extracted.middleName || fromFullName.middleName),
    lastName: valueOrExisting(registration.lastName, extracted.lastName || fromFullName.lastName),
    address: {
      ...registration.address,
      street: valueOrExisting(registration.address?.street, extracted.street),
      barangay: valueOrExisting(registration.address?.barangay, extracted.barangay),
      city: valueOrExisting(registration.address?.city, extracted.city),
      province: valueOrExisting(registration.address?.province, extracted.province),
      zipCode: valueOrExisting(registration.address?.zipCode, extracted.zipCode)
    }
  };
};

export const isGovernmentIdConfirmed = (review, selectedType) => review?.status === 'matched'
  && review.selectedType === selectedType;
