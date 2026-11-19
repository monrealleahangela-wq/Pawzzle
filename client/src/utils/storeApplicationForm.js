import {
  BUSINESS_CATEGORIES,
  CATEGORY_REQUIREMENTS,
  categoryDocumentField,
  combinedCategoryRequirements,
  deriveOperationalModules
} from './storeApplicationRequirements';

const currentYear = () => new Date().getFullYear();

const dateInputValue = value => {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
};

export const createStoreApplicationForm = user => ({
  businessCategories: [],
  operationalModules: [],
  staffingConfiguration: {
    hasStaff: 'no',
    staffQuantityRange: '1-5',
    isStaffVisibleToCustomers: false,
    requiresProfessionalVerification: false
  },
  staffTypes: [],
  hiringStaff: false,
  supplierNeeds: false,
  inventoryPlans: '',
  productCategories: [],
  activityDocumentDetails: {
    pets: { issueDate: '', expiryDate: '' },
    products: { issueDate: '', expiryDate: '' },
    services: { issueDate: '', expiryDate: '' }
  },
  categoryDocumentDetails: Object.fromEntries(Object.values(CATEGORY_REQUIREMENTS).flat().map(requirement => [requirement.key, {
    issueDate: '', expiryDate: ''
  }])),
  businessName: '',
  tradeName: '',
  registeredBusinessName: '',
  natureOfBusiness: '',
  yearBusinessStarted: currentYear(),
  businessType: '',
  legalStructure: 'sole_proprietorship',
  yearsInBusiness: 0,
  numberOfEmployees: 1,
  hasPhysicalStore: true,
  businessLicense: { number: '', issuingAuthority: '', issueDate: '', expiryDate: '' },
  representative: {
    fullName: [user?.firstName, user?.lastName].filter(Boolean).join(' '),
    role: 'Owner',
    phone: user?.phone || '',
    email: user?.email || '',
    isAuthorizedRepresentative: false
  },
  businessRegistration: {
    authority: 'dti', certificateNumber: '', registeredName: '', registrationDate: '', expirationDate: ''
  },
  barangayClearance: { number: '', issuingBarangay: '', issueDate: '', expiryDate: '' },
  taxProfile: {
    birRegistrationStatus: 'registered',
    taxpayerClassification: '',
    tin: '',
    branchCode: '000',
    registeredName: '',
    registeredAddress: { unitBuilding: '', street: '', barangay: '', city: '', province: 'Cavite', postalCode: '', country: 'PH' },
    lineOfBusiness: '',
    declaredTaxStatus: ''
  },
  declaration: { accepted: false, applicantName: '' },
  contactInfo: {
    phone: user?.phone || '',
    email: user?.email || '',
    address: {
      unitBuilding: '', street: '', city: '', barangay: '', state: 'cavite', province: 'Cavite',
      zipCode: '', country: 'PH', landmark: '', coordinates: { lat: '', lng: '' }
    }
  },
  paymentInfo: {
    bankName: '', bankAccountName: '', bankAccountNumber: '',
    alternativePaymentMethod: { provider: 'GCash', accountNumber: '' }
  },
  productsOffered: [],
  businessDescription: '',
  emergencyContact: { name: '', phone: '', relationship: '' },
  references: [
    { name: '', business: '', phone: '', email: '' },
    { name: '', business: '', phone: '', email: '' }
  ]
});

export const hydrateStoreApplicationForm = (application, user) => {
  const defaults = createStoreApplicationForm(user);
  const address = application?.contactInfo?.address || {};
  const registration = application?.businessRegistration || {};
  const taxProfile = application?.taxProfile || {};
  const barangayClearance = application?.barangayClearance || {};
  const registeredAddress = taxProfile.registeredAddress || {};
  const paymentInfo = application?.paymentInfo || {};
  const alternativePaymentMethod = paymentInfo.alternativePaymentMethod || {};
  const representative = application?.representative || {};
  const staffing = application?.staffingConfiguration || {};
  const activityDocuments = application?.activityDocuments || [];
  const activityDocumentDetails = Object.fromEntries(['pets', 'products', 'services'].map(activity => {
    const document = activityDocuments.find(item => item.activity === activity) || {};
    return [activity, { issueDate: dateInputValue(document.issueDate), expiryDate: dateInputValue(document.expiryDate) }];
  }));

  return {
    ...defaults,
    businessCategories: application?.businessCategories || defaults.businessCategories,
    operationalModules: application?.operationalModules || deriveOperationalModules(application?.businessCategories || []),
    staffingConfiguration: { ...defaults.staffingConfiguration, ...staffing },
    staffTypes: application?.staffTypes || defaults.staffTypes,
    hiringStaff: application?.hiringStaff ?? defaults.hiringStaff,
    supplierNeeds: application?.supplierNeeds ?? defaults.supplierNeeds,
    inventoryPlans: application?.inventoryPlans || '',
    productCategories: application?.productCategories || [],
    activityDocumentDetails: { ...defaults.activityDocumentDetails, ...activityDocumentDetails },
    categoryDocumentDetails: {
      ...defaults.categoryDocumentDetails,
      ...Object.fromEntries((application?.categoryDocuments || []).map(document => [document.requirementKey, {
        issueDate: dateInputValue(document.issueDate), expiryDate: dateInputValue(document.expiryDate)
      }]))
    },
    businessName: application?.businessName || '',
    tradeName: application?.tradeName || application?.businessName || '',
    registeredBusinessName: application?.registeredBusinessName || registration.registeredName || '',
    natureOfBusiness: application?.natureOfBusiness || '',
    yearBusinessStarted: application?.yearBusinessStarted || defaults.yearBusinessStarted,
    businessType: application?.businessType || '',
    legalStructure: application?.legalStructure || defaults.legalStructure,
    yearsInBusiness: application?.yearsInBusiness ?? 0,
    numberOfEmployees: application?.numberOfEmployees ?? 1,
    hasPhysicalStore: application?.hasPhysicalStore ?? true,
    businessLicense: {
      ...defaults.businessLicense,
      ...(application?.businessLicense || {}),
      issueDate: dateInputValue(application?.businessLicense?.issueDate),
      expiryDate: dateInputValue(application?.businessLicense?.expiryDate)
    },
    representative: { ...defaults.representative, ...representative },
    businessRegistration: {
      ...defaults.businessRegistration,
      ...registration,
      registeredName: registration.registeredName || application?.registeredBusinessName || '',
      registrationDate: dateInputValue(registration.registrationDate),
      expirationDate: dateInputValue(registration.expirationDate)
    },
    barangayClearance: {
      ...defaults.barangayClearance,
      ...barangayClearance,
      issueDate: dateInputValue(barangayClearance.issueDate),
      expiryDate: dateInputValue(barangayClearance.expiryDate)
    },
    taxProfile: {
      ...defaults.taxProfile,
      ...taxProfile,
      registeredAddress: { ...defaults.taxProfile.registeredAddress, ...registeredAddress }
    },
    declaration: { accepted: false, applicantName: application?.declaration?.applicantName || defaults.declaration.applicantName },
    contactInfo: {
      ...defaults.contactInfo,
      ...(application?.contactInfo || {}),
      address: {
        ...defaults.contactInfo.address,
        ...address,
        province: address.province || address.state || defaults.contactInfo.address.province,
        coordinates: { ...defaults.contactInfo.address.coordinates, ...(address.coordinates || {}) }
      }
    },
    paymentInfo: {
      ...defaults.paymentInfo,
      ...paymentInfo,
      alternativePaymentMethod: { ...defaults.paymentInfo.alternativePaymentMethod, ...alternativePaymentMethod }
    },
    productsOffered: application?.productsOffered || [],
    businessDescription: application?.businessDescription || '',
    emergencyContact: { ...defaults.emergencyContact, ...(application?.emergencyContact || {}) },
    references: application?.references?.length >= 2 ? application.references.map(reference => ({
      name: reference?.name || '', business: reference?.business || '', phone: reference?.phone || '', email: reference?.email || ''
    })) : defaults.references
  };
};

export const STORE_APPLICATION_FIELD_STEPS = {
  businessCategories: 0,
  businessName: 1,
  registeredBusinessName: 1,
  businessType: 1,
  legalStructure: 1,
  natureOfBusiness: 1,
  businessDescription: 1,
  'representative.fullName': 1,
  'representative.role': 1,
  'representative.phone': 1,
  'representative.email': 1,
  'contactInfo.phone': 1,
  'contactInfo.email': 1,
  'businessRegistration.authority': 1,
  'businessRegistration.certificateNumber': 1,
  'businessRegistration.registeredName': 1,
  'taxProfile.tin': 1,
  'contactInfo.address.street': 2,
  'contactInfo.address.barangay': 2,
  'contactInfo.address.city': 2,
  'contactInfo.address.province': 2,
  'contactInfo.address.zipCode': 2,
  'contactInfo.address.coordinates': 2,
  storefrontPhotos: 2,
  authorityDocument: 3,
  businessRegistration: 3,
  birRegistration: 3,
  mayorsPermit: 3,
  governmentId: 3,
  proofOfBusinessAddress: 3,
  categoryDocuments: 3,
  'taxProfile.birRegistrationStatus': 3,
  'taxProfile.branchCode': 3,
  'taxProfile.registeredName': 3,
  'taxProfile.lineOfBusiness': 3,
  'taxProfile.registeredAddress.street': 3,
  'taxProfile.registeredAddress.barangay': 3,
  'taxProfile.registeredAddress.city': 3,
  'taxProfile.registeredAddress.province': 3,
  'taxProfile.registeredAddress.postalCode': 3,
  'taxProfile.declaredTaxStatus': 3,
  references: 5,
  'declaration.applicantName': 5,
  'declaration.accepted': 5,
  ...Object.fromEntries(Object.values(CATEGORY_REQUIREMENTS).flat().map(requirement => [categoryDocumentField(requirement.key), 3]))
};

const present = value => value !== undefined && value !== null && String(value).trim() !== '';
const email = value => /^\S+@\S+\.\S+$/.test(String(value || '').trim());

export const validateStoreApplicationForm = (data, { files = {}, documentAvailability = {} } = {}) => {
  const errors = {};
  if (!Array.isArray(data.businessCategories) || !data.businessCategories.length) {
    errors.businessCategories = 'Select at least one business category.';
  } else if (data.businessCategories.some(category => !BUSINESS_CATEGORIES.some(option => option.id === category))) {
    errors.businessCategories = 'Select valid business categories.';
  }
  const requireField = (field, value, message) => {
    if (!present(value) && !errors[field]) errors[field] = message;
  };
  requireField('businessName', data.businessName, 'Store name is required.');
  requireField('registeredBusinessName', data.registeredBusinessName, 'Registered business name is required.');
  requireField('businessType', data.businessType, 'Business classification is required.');
  requireField('legalStructure', data.legalStructure, 'Business structure is required.');
  requireField('natureOfBusiness', data.natureOfBusiness, 'Nature or line of business is required.');
  requireField('businessDescription', data.businessDescription, 'Business description is required.');

  for (const [field, value, message] of [
    ['representative.fullName', data.representative?.fullName, 'Representative legal name is required.'],
    ['representative.role', data.representative?.role, 'Representative role is required.'],
    ['representative.phone', data.representative?.phone, 'Representative phone is required.'],
    ['representative.email', data.representative?.email, 'Representative email is required.'],
    ['contactInfo.phone', data.contactInfo?.phone, 'Primary contact number is required.'],
    ['contactInfo.email', data.contactInfo?.email, 'Business email is required.'],
    ['contactInfo.address.street', data.contactInfo?.address?.street, 'Street address is required.'],
    ['contactInfo.address.barangay', data.contactInfo?.address?.barangay, 'Barangay is required.'],
    ['contactInfo.address.city', data.contactInfo?.address?.city, 'City or municipality is required.'],
    ['contactInfo.address.province', data.contactInfo?.address?.province || data.contactInfo?.address?.state, 'Province is required.'],
    ['contactInfo.address.zipCode', data.contactInfo?.address?.zipCode, 'Postal code is required.'],
    ['businessRegistration.certificateNumber', data.businessRegistration?.certificateNumber, 'Registration number is required.'],
    ['businessRegistration.registeredName', data.businessRegistration?.registeredName, 'Registered name is required.'],
    ['declaration.applicantName', data.declaration?.applicantName, 'Applicant name is required.']
  ]) requireField(field, value, message);
  if (data.contactInfo?.email && !email(data.contactInfo.email)) errors['contactInfo.email'] = 'Enter a valid business email.';
  if (data.representative?.email && !email(data.representative.email)) errors['representative.email'] = 'Enter a valid representative email.';

  const lat = Number(data.contactInfo?.address?.coordinates?.lat);
  const lng = Number(data.contactInfo?.address?.coordinates?.lng);
  const rawLat = data.contactInfo?.address?.coordinates?.lat;
  const rawLng = data.contactInfo?.address?.coordinates?.lng;
  if (rawLat === '' || rawLat === undefined || rawLat === null || rawLng === '' || rawLng === undefined || rawLng === null
      || !Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    errors['contactInfo.address.coordinates'] = 'Select and confirm the store location on the map.';
  } else if (lat < 13.95 || lat > 14.55 || lng < 120.55 || lng > 121.15) {
    errors['contactInfo.address.coordinates'] = 'The confirmed store pin must be inside Cavite.';
  }
  if (String(data.contactInfo?.address?.province || data.contactInfo?.address?.state || '').trim().toLowerCase() !== 'cavite') {
    errors['contactInfo.address.province'] = 'Store applications currently require a Cavite address.';
  }
  if (data.representative?.isAuthorizedRepresentative && !files.authorityDocument && !documentAvailability.authorityDocument) {
    errors.authorityDocument = 'Proof of authority is required.';
  }
  if (!files.businessRegistration && !documentAvailability.businessRegistration) {
    errors.businessRegistration = 'Business registration document is required.';
  }
  if (!files.mayorsPermit && !documentAvailability.mayorsPermit) {
    errors.mayorsPermit = "Mayor's or business permit is required.";
  }
  if (!files.governmentId && !documentAvailability.governmentId) {
    errors.governmentId = 'A valid government-issued ID is required.';
  }
  const storefrontPhotos = Array.isArray(files.storefrontPhotos) ? files.storefrontPhotos.length : 0;
  if (storefrontPhotos + Number(documentAvailability.storefrontPhotos || 0) < 2) {
    errors.storefrontPhotos = 'Upload at least two storefront photos.';
  }
  for (const requirement of combinedCategoryRequirements(data.businessCategories).filter(item => item.level === 'required')) {
    const field = `categoryDocument__${requirement.key}`;
    if (!files[field] && !documentAvailability.categoryDocuments?.[requirement.key]) {
      errors.categoryDocuments = `${requirement.label} is required.`;
      break;
    }
  }
  if (data.taxProfile?.birRegistrationStatus !== 'registered') {
    errors['taxProfile.birRegistrationStatus'] = 'A BIR-registered business and Form 2303 are required.';
  }
  if (data.taxProfile?.birRegistrationStatus === 'registered') {
    for (const [field, value, message] of [
      ['taxProfile.tin', data.taxProfile.tin, 'TIN is required.'],
      ['taxProfile.branchCode', data.taxProfile.branchCode, 'Branch code is required.'],
      ['taxProfile.registeredName', data.taxProfile.registeredName, 'BIR registered name is required.'],
      ['taxProfile.lineOfBusiness', data.taxProfile.lineOfBusiness, 'BIR line of business is required.'],
      ['taxProfile.declaredTaxStatus', data.taxProfile.declaredTaxStatus, 'Declared tax status is required.'],
      ['taxProfile.registeredAddress.street', data.taxProfile.registeredAddress?.street, 'BIR registered street is required.'],
      ['taxProfile.registeredAddress.barangay', data.taxProfile.registeredAddress?.barangay, 'BIR registered barangay is required.'],
      ['taxProfile.registeredAddress.city', data.taxProfile.registeredAddress?.city, 'BIR registered city is required.'],
      ['taxProfile.registeredAddress.province', data.taxProfile.registeredAddress?.province, 'BIR registered province is required.'],
      ['taxProfile.registeredAddress.postalCode', data.taxProfile.registeredAddress?.postalCode, 'BIR registered postal code is required.']
    ]) requireField(field, value, message);
    if (!files.birRegistration && !documentAvailability.birRegistration) errors.birRegistration = 'BIR Form 2303 is required.';
  }
  if (data.declaration?.accepted !== true) errors['declaration.accepted'] = 'Accept the declaration before submitting.';
  return errors;
};

export const firstInvalidStep = errors => Object.keys(errors).reduce((first, field) => {
  const step = STORE_APPLICATION_FIELD_STEPS[field] ?? 1;
  return first === null || step < first ? step : first;
}, null);
