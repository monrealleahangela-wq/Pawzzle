export const STORE_DOCUMENT_OCR_TYPES = Object.freeze({
  businessRegistration: 'business_registration',
  mayorsPermit: 'business_permit',
  barangayClearance: 'barangay_clearance',
  birRegistration: 'bir_registration'
});

const DOCUMENT_FIELDS = Object.freeze({
  business_registration: [
    'businessRegistration.certificateNumber',
    'businessRegistration.registeredName',
    'businessRegistration.registrationDate',
    'businessRegistration.expirationDate'
  ],
  business_permit: [
    'businessLicense.number',
    'businessLicense.issuingAuthority',
    'businessLicense.issueDate',
    'businessLicense.expiryDate'
  ],
  barangay_clearance: [
    'barangayClearance.number',
    'barangayClearance.issuingBarangay',
    'barangayClearance.issueDate',
    'barangayClearance.expiryDate'
  ],
  bir_registration: [
    'taxProfile.tin',
    'taxProfile.branchCode',
    'taxProfile.registeredName',
    'taxProfile.lineOfBusiness',
    'taxProfile.declaredTaxStatus'
  ]
});

const valueAtPath = (source, path) => path.split('.').reduce((value, part) => value?.[part], source);

export const expectedStoreDocumentValues = (form, documentType) => Object.fromEntries(
  (DOCUMENT_FIELDS[documentType] || [])
    .map(field => [field, valueAtPath(form, field)])
    .filter(([_field, value]) => value !== undefined && value !== null && String(value).trim())
    .map(([field, value]) => [field, String(value).trim()])
);

const setPath = (target, path, value) => {
  const parts = path.split('.');
  let cursor = target;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) cursor[part] = value;
    else {
      cursor[part] = { ...(cursor[part] || {}) };
      cursor = cursor[part];
    }
  });
};

export const canOcrStoreDocument = file => (
  Boolean(file) && ['image/jpeg', 'image/png'].includes(String(file.type || '').toLowerCase())
);

export const applyStoreDocumentExtraction = (form, extraction) => {
  const next = { ...form };
  for (const [field, result] of Object.entries(extraction?.fields || {})) {
    if (typeof result?.value !== 'string' || !result.value.trim()) continue;
    setPath(next, field, result.value.trim());
  }
  const registeredName = extraction?.fields?.['businessRegistration.registeredName']?.value?.trim();
  if (registeredName) next.registeredBusinessName = registeredName;
  return next;
};
