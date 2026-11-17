export const STORE_DOCUMENT_OCR_TYPES = Object.freeze({
  businessRegistration: 'business_registration',
  mayorsPermit: 'business_permit',
  barangayClearance: 'barangay_clearance',
  birRegistration: 'bir_registration'
});

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
