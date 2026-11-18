import {
  applyStoreDocumentExtraction,
  canOcrStoreDocument,
  expectedStoreDocumentValues,
  STORE_DOCUMENT_OCR_TYPES
} from './storeDocumentOcr';

test('maps supported upload controls to OCR document types', () => {
  expect(STORE_DOCUMENT_OCR_TYPES).toEqual({
    businessRegistration: 'business_registration',
    mayorsPermit: 'business_permit',
    barangayClearance: 'barangay_clearance',
    birRegistration: 'bir_registration'
  });
  expect(canOcrStoreDocument({ type: 'image/png' })).toBe(true);
  expect(canOcrStoreDocument({ type: 'application/pdf' })).toBe(false);
});

test('sends only comparable entered values for document consistency checks', () => {
  expect(expectedStoreDocumentValues({
    businessRegistration: { certificateNumber: ' DTI-123 ', registeredName: 'Pawzzle Trading', expirationDate: '' },
    registeredBusinessName: 'Not part of the document field map'
  }, 'business_registration')).toEqual({
    'businessRegistration.certificateNumber': 'DTI-123',
    'businessRegistration.registeredName': 'Pawzzle Trading'
  });
});

test('applies approved fields immutably and synchronizes the registered name', () => {
  const form = {
    registeredBusinessName: '',
    businessRegistration: { certificateNumber: '', registeredName: '', expirationDate: '' },
    taxProfile: { tin: '' }
  };
  const next = applyStoreDocumentExtraction(form, { fields: {
    'businessRegistration.certificateNumber': { value: 'DTI-123', confidence: 99 },
    'businessRegistration.registeredName': { value: 'Pawzzle Trading', confidence: 98 },
    'businessRegistration.expirationDate': { value: '2031-05-12', confidence: 95 }
  } });

  expect(next).not.toBe(form);
  expect(next.businessRegistration).not.toBe(form.businessRegistration);
  expect(next.businessRegistration.certificateNumber).toBe('DTI-123');
  expect(next.registeredBusinessName).toBe('Pawzzle Trading');
  expect(form.businessRegistration.certificateNumber).toBe('');
});
