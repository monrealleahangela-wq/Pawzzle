const Store = require('../models/Store');
const User = require('../models/User');
const StoreApplication = require('../models/StoreApplication');
const StoreComplianceRequest = require('../models/StoreComplianceRequest');
const ActivityLog = require('../models/ActivityLog');
const { createNotification } = require('./notificationController');
const { isPlatformAdmin } = require('../config/permissions');
const { getComplianceSummary, syncExpirationRestrictions } = require('../services/storeComplianceService');

const BUSINESS_STRUCTURES = ['single_proprietorship', 'sole_proprietorship', 'one_person_corporation', 'corporation', 'partnership', 'cooperative', 'other'];
const AUTHORITIES = ['dti', 'sec', 'cda', 'other'];
const TAX_STATUSES = ['vat_registered', 'non_vat_registered'];
const REQUEST_TYPES = ['initial_verification', 'business_update', 'tax_update', 'document_replacement', 'document_renewal'];

const maskTin = value => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? `${digits.slice(0, 3)}-***-***${digits.length > 9 ? `-${digits.slice(-3)}` : ''}` : null;
};
const parse = value => {
  if (typeof value !== 'string') return value || {};
  try { return JSON.parse(value); } catch (_) { return {}; }
};
const fileUrl = file => file?.path || file?.secure_url;
const normalizeBoolean = value => value === true || value === 'true';

const privateStoreQuery = query => query.select([
  '+taxProfile.tin', '+taxProfile.branchCode', '+taxProfile.corDocumentUrl',
  '+businessProfile.registrationNumber', '+businessCompliance.documents.versions.documentUrl'
].join(' '));
const privateRequestQuery = query => query.select('+proposedDocuments.documentUrl');
const privateApplicationQuery = query => query.select('+businessRegistration.documentUrl +taxProfile.tin +taxProfile.branchCode +taxProfile.corDocumentUrl +representative.authorityDocumentUrl');

const safeRequest = (request, { documents = false } = {}) => {
  if (!request) return null;
  const row = request.toObject ? request.toObject() : { ...request };
  if (row.proposedProfile?.tax?.tin) {
    row.proposedProfile.tax.tinMasked = maskTin(row.proposedProfile.tax.tin);
    delete row.proposedProfile.tax.tin;
  }
  if (row.currentSnapshot?.tax?.tin) {
    row.currentSnapshot.tax.tinMasked = maskTin(row.currentSnapshot.tax.tin);
    delete row.currentSnapshot.tax.tin;
  }
  if (row.proposedProfile?.representative) delete row.proposedProfile.representative.authorityDocumentUrl;
  if (row.currentSnapshot?.representative) delete row.currentSnapshot.representative.authorityDocumentUrl;
  row.proposedDocuments = (row.proposedDocuments || []).map(document => {
    const value = { ...document };
    value.hasDocument = Boolean(value.documentUrl);
    if (!documents) delete value.documentUrl;
    return value;
  });
  return row;
};

const ownerStore = userId => privateStoreQuery(Store.findOne({ owner: userId, isDeleted: { $ne: true } }));

const currentSnapshot = (store, application) => ({
  business: {
    registeredBusinessName: store.businessProfile?.registeredBusinessName || application?.registeredBusinessName || '',
    tradeName: store.businessProfile?.tradeName || store.name || application?.tradeName || application?.businessName || '',
    legalStructure: store.businessProfile?.legalStructure || store.legalStructure || application?.legalStructure || '',
    natureOfBusiness: store.businessProfile?.natureOfBusiness || application?.natureOfBusiness || '',
    registrationAuthority: store.businessProfile?.registrationAuthority || application?.businessRegistration?.authority || '',
    registrationNumber: store.businessProfile?.registrationNumber || application?.businessRegistration?.certificateNumber || '',
    registrationDate: store.businessProfile?.registrationDate || application?.businessRegistration?.registrationDate || null,
    registrationExpirationDate: store.businessProfile?.registrationExpirationDate || application?.businessRegistration?.expirationDate || null,
    registeredAddress: store.businessProfile?.registeredAddress || store.contactInfo?.address || application?.contactInfo?.address || {}
  },
  representative: store.businessCompliance?.representative || application?.representative || {},
  tax: {
    birRegistrationStatus: store.taxProfile?.birRegistered ? 'registered' : (application?.taxProfile?.birRegistrationStatus || 'not_registered'),
    taxpayerClassification: application?.taxProfile?.taxpayerClassification || '',
    tin: store.taxProfile?.tin || application?.taxProfile?.tin || '',
    branchCode: store.taxProfile?.branchCode || application?.taxProfile?.branchCode || '',
    registeredName: store.taxProfile?.registeredName || application?.taxProfile?.registeredName || '',
    registeredAddress: store.taxProfile?.registeredAddress || application?.taxProfile?.registeredAddress || {},
    lineOfBusiness: store.taxProfile?.lineOfBusiness || application?.taxProfile?.lineOfBusiness || '',
    declaredTaxStatus: store.taxProfile?.declaredTaxStatus || application?.taxProfile?.declaredTaxStatus || null,
    verifiedTaxStatus: store.taxProfile?.verifiedTaxStatus || null,
    verificationStatus: store.taxProfile?.verificationStatus || 'unverified'
  }
});

const validateProposal = ({ proposedProfile, reason, files, existingDocuments }) => {
  const errors = [];
  const business = proposedProfile.business || {};
  const representative = proposedProfile.representative || {};
  const tax = proposedProfile.tax || {};
  const requireField = (value, field, message) => {
    if (value === undefined || value === null || String(value).trim() === '') errors.push({ field, message });
  };
  if (!reason || String(reason).trim().length < 10) errors.push({ field: 'reason', message: 'Explain the requested update or renewal.' });
  requireField(business.registeredBusinessName, 'business.registeredBusinessName', 'Registered business name is required.');
  requireField(business.tradeName, 'business.tradeName', 'Trade name is required.');
  if (!BUSINESS_STRUCTURES.includes(business.legalStructure)) errors.push({ field: 'business.legalStructure', message: 'Select a valid business structure.' });
  requireField(business.natureOfBusiness, 'business.natureOfBusiness', 'Nature of business is required.');
  if (!AUTHORITIES.includes(business.registrationAuthority)) errors.push({ field: 'business.registrationAuthority', message: 'Select a valid registration authority.' });
  const expected = ['single_proprietorship', 'sole_proprietorship'].includes(business.legalStructure) ? 'dti'
    : ['one_person_corporation', 'corporation', 'partnership'].includes(business.legalStructure) ? 'sec'
      : business.legalStructure === 'cooperative' ? 'cda' : null;
  if (expected && business.registrationAuthority !== expected) errors.push({ field: 'business.registrationAuthority', message: `${expected.toUpperCase()} registration is expected for this business structure.` });
  requireField(business.registrationNumber, 'business.registrationNumber', 'Registration number is required.');
  for (const [key, label] of [['street', 'street'], ['barangay', 'barangay'], ['city', 'city / municipality']]) {
    requireField(business.registeredAddress?.[key], `business.registeredAddress.${key}`, `Registered business ${label} is required.`);
  }
  requireField(representative.fullName, 'representative.fullName', 'Representative legal name is required.');
  requireField(representative.role, 'representative.role', 'Representative role is required.');
  requireField(representative.phone, 'representative.phone', 'Representative phone is required.');
  requireField(representative.email, 'representative.email', 'Representative email is required.');
  if (!files.businessRegistration && !existingDocuments.businessRegistration) errors.push({ field: 'businessRegistration', message: 'Business registration document is required.' });
  if (representative.isAuthorizedRepresentative && !files.authorityDocument && !existingDocuments.authorityDocument) errors.push({ field: 'authorityDocument', message: 'Proof of authority is required for an authorized representative.' });
  if (!['registered', 'not_registered', 'pending_registration'].includes(tax.birRegistrationStatus)) errors.push({ field: 'tax.birRegistrationStatus', message: 'Select the BIR registration status.' });
  if (tax.birRegistrationStatus === 'registered') {
    requireField(tax.tin, 'tax.tin', 'TIN is required.');
    requireField(tax.branchCode, 'tax.branchCode', 'Branch code is required.');
    requireField(tax.registeredName, 'tax.registeredName', 'BIR registered name is required.');
    requireField(tax.lineOfBusiness, 'tax.lineOfBusiness', 'BIR line of business is required.');
    for (const [key, label] of [['street', 'street'], ['barangay', 'barangay'], ['city', 'city / municipality'], ['province', 'province'], ['postalCode', 'postal code']]) {
      requireField(tax.registeredAddress?.[key], `tax.registeredAddress.${key}`, `BIR registered ${label} is required.`);
    }
    if (!TAX_STATUSES.includes(tax.declaredTaxStatus)) errors.push({ field: 'tax.declaredTaxStatus', message: 'Declared VAT or Non-VAT status is required.' });
    if (tax.tin && !/^\d{3}[- ]?\d{3}[- ]?\d{3,6}$/.test(String(tax.tin).trim())) errors.push({ field: 'tax.tin', message: 'Enter a valid TIN.' });
    if (!files.birCertificate && !existingDocuments.birCertificate) errors.push({ field: 'birCertificate', message: 'BIR Certificate of Registration (Form 2303) is required.' });
  }
  return errors;
};

const documentMetadata = (metadata, key) => metadata?.[key] || {};
const makeDocument = (key, label, file, metadata = {}, flags = {}) => ({
  requirementKey: key,
  label,
  documentUrl: fileUrl(file),
  originalName: file.originalname,
  mimeType: file.mimetype,
  size: file.size,
  issueDate: metadata.issueDate || undefined,
  hasExpiration: normalizeBoolean(metadata.hasExpiration),
  expirationDate: normalizeBoolean(metadata.hasExpiration) ? metadata.expirationDate || undefined : undefined,
  requiredForOperation: Boolean(flags.requiredForOperation),
  taxAffecting: Boolean(flags.taxAffecting)
});

const getMyCompliance = async (req, res) => {
  try {
    const store = await ownerStore(req.user._id);
    if (!store) return res.status(404).json({ message: 'Store not found.' });
    const application = await privateApplicationQuery(StoreApplication.findById(store.businessProfile?.sourceApplication || store.taxProfile?.sourceApplication));
    const request = await privateRequestQuery(StoreComplianceRequest.findOne({ store: store._id, status: { $in: ['pending_review', 'under_review', 'needs_correction'] } }).sort({ updatedAt: -1 }));
    const snapshot = currentSnapshot(store, application);
    const safeRepresentative = { ...(snapshot.representative || {}) };
    delete safeRepresentative.authorityDocumentUrl;
    res.json({
      store: { _id: store._id, name: store.name },
      currentProfile: {
        ...snapshot,
        representative: safeRepresentative,
        tax: { ...snapshot.tax, tinMasked: maskTin(snapshot.tax.tin), tin: undefined, branchCode: snapshot.tax.branchCode || null }
      },
      compliance: {
        ...getComplianceSummary(store),
        documentHistory: (store.businessCompliance?.documents || []).map(document => ({
          requirementKey: document.requirementKey,
          label: document.label,
          currentVersion: document.currentVersion,
          versions: (document.versions || []).map(version => ({
            _id: version._id, version: version.version, originalName: version.originalName,
            issueDate: version.issueDate, hasExpiration: version.hasExpiration,
            expirationDate: version.expirationDate, verificationStatus: version.verificationStatus,
            submittedAt: version.submittedAt, verifiedAt: version.verifiedAt
          }))
        }))
      },
      currentRequest: safeRequest(request),
      legacyDocuments: {
        businessRegistration: Boolean(application?.businessRegistration?.documentUrl),
        birCertificate: Boolean(application?.taxProfile?.corDocumentUrl),
        authorityDocument: Boolean(application?.representative?.authorityDocumentUrl)
      }
    });
  } catch (error) {
    console.error('Get store compliance error:', error);
    res.status(500).json({ message: 'Unable to load Business & Tax Information.' });
  }
};

const getCurrentComplianceDocument = async (req, res) => {
  try {
    const store = isPlatformAdmin(req.user)
      ? await privateStoreQuery(Store.findById(req.params.storeId))
      : await ownerStore(req.user._id);
    if (!store || (req.params.storeId && !isPlatformAdmin(req.user) && String(store._id) !== String(req.params.storeId))) return res.status(404).json({ message: 'Store not found.' });
    const document = (store.businessCompliance?.documents || []).find(row => row.requirementKey === req.params.requirementKey);
    const versionNumber = req.query.version ? Number(req.query.version) : Number(document?.currentVersion);
    const version = document?.versions?.find(row => Number(row.version) === versionNumber);
    if (!version?.documentUrl) return res.status(404).json({ message: 'Document not found.' });
    res.json({ url: version.documentUrl, name: version.originalName || document.label });
  } catch (_) { res.status(500).json({ message: 'Unable to open document.' }); }
};

const submitComplianceRequest = async (req, res) => {
  try {
    const store = await ownerStore(req.user._id);
    if (!store) return res.status(404).json({ message: 'Store not found.' });
    const application = await privateApplicationQuery(StoreApplication.findById(store.businessProfile?.sourceApplication || store.taxProfile?.sourceApplication));
    const current = currentSnapshot(store, application);
    const submitted = parse(req.body.proposedProfile);
    const proposedProfile = {
      business: { ...current.business, ...(submitted.business || {}) },
      representative: { ...current.representative, ...(submitted.representative || {}) },
      tax: { ...current.tax, ...(submitted.tax || {}) }
    };
    // Authoritative values can only be set by Platform Admin.
    delete proposedProfile.tax.verifiedTaxStatus;
    delete proposedProfile.tax.verificationStatus;
    const metadata = parse(req.body.documentMetadata);
    const existingDocuments = {
      businessRegistration: Boolean(application?.businessRegistration?.documentUrl || getComplianceSummary(store).documents.some(row => row.requirementKey === 'business_registration' && row.hasDocument)),
      birCertificate: Boolean(application?.taxProfile?.corDocumentUrl || store.taxProfile?.corDocumentUrl || getComplianceSummary(store).documents.some(row => row.requirementKey === 'bir_certificate' && row.hasDocument)),
      authorityDocument: Boolean(application?.representative?.authorityDocumentUrl || getComplianceSummary(store).documents.some(row => row.requirementKey === 'authority_document' && row.hasDocument))
    };
    const fileMap = {
      businessRegistration: req.files?.businessRegistration?.[0],
      birCertificate: req.files?.birCertificate?.[0],
      authorityDocument: req.files?.authorityDocument?.[0],
      mayorsPermit: req.files?.mayorsPermit?.[0],
      barangayClearance: req.files?.barangayClearance?.[0]
    };
    const errors = validateProposal({ proposedProfile, reason: req.body.reason, files: fileMap, existingDocuments });
    for (const [key, file] of Object.entries(fileMap)) {
      const values = documentMetadata(metadata, key);
      if (file && normalizeBoolean(values.hasExpiration) && (!values.expirationDate || Number.isNaN(new Date(values.expirationDate).getTime()))) {
        errors.push({ field: `${key}.expirationDate`, message: 'Enter the document expiration date shown on the document.' });
      }
      if (file && values.issueDate && values.expirationDate && new Date(values.expirationDate) <= new Date(values.issueDate)) {
        errors.push({ field: `${key}.expirationDate`, message: 'Expiration date must be later than the issue date.' });
      }
    }
    if (errors.length) return res.status(400).json({ message: 'Complete the required Business & Tax fields.', errors });

    let request = await privateRequestQuery(StoreComplianceRequest.findOne({ store: store._id, status: { $in: ['pending_review', 'under_review', 'needs_correction'] } }));
    const isCorrection = request?.status === 'needs_correction';
    if (request && !isCorrection) return res.status(409).json({ message: 'A Business & Tax update is already under review.' });
    const requestType = isCorrection ? 'correction_resubmission' : (REQUEST_TYPES.includes(req.body.requestType) ? req.body.requestType : (store.taxProfile?.verificationStatus === 'verified' ? 'business_update' : 'initial_verification'));
    const proposedDocuments = [
      fileMap.businessRegistration && makeDocument('business_registration', 'Business Registration', fileMap.businessRegistration, documentMetadata(metadata, 'businessRegistration'), { requiredForOperation: true }),
      fileMap.birCertificate && makeDocument('bir_certificate', 'BIR Certificate of Registration (Form 2303)', fileMap.birCertificate, documentMetadata(metadata, 'birCertificate'), { requiredForOperation: true, taxAffecting: true }),
      fileMap.authorityDocument && makeDocument('authority_document', 'Proof of Authority', fileMap.authorityDocument, documentMetadata(metadata, 'authorityDocument'), { requiredForOperation: true }),
      fileMap.mayorsPermit && makeDocument('mayors_permit', "Mayor's Permit", fileMap.mayorsPermit, documentMetadata(metadata, 'mayorsPermit')),
      fileMap.barangayClearance && makeDocument('barangay_clearance', 'Barangay Clearance', fileMap.barangayClearance, documentMetadata(metadata, 'barangayClearance'))
    ].filter(Boolean);
    const versionedKeys = new Set(getComplianceSummary(store).documents.filter(row => row.hasDocument).map(row => row.requirementKey));
    if (!fileMap.businessRegistration && !versionedKeys.has('business_registration') && application?.businessRegistration?.documentUrl) {
      proposedDocuments.push({
        requirementKey: 'business_registration', label: 'Business Registration', documentUrl: application.businessRegistration.documentUrl,
        issueDate: application.businessRegistration.registrationDate, hasExpiration: Boolean(application.businessRegistration.expirationDate),
        expirationDate: application.businessRegistration.expirationDate, requiredForOperation: true, taxAffecting: false
      });
    }
    if (!fileMap.birCertificate && !versionedKeys.has('bir_certificate') && application?.taxProfile?.corDocumentUrl && proposedProfile.tax.birRegistrationStatus === 'registered') {
      proposedDocuments.push({ requirementKey: 'bir_certificate', label: 'BIR Certificate of Registration (Form 2303)', documentUrl: application.taxProfile.corDocumentUrl, hasExpiration: false, requiredForOperation: true, taxAffecting: true });
    }
    if (!fileMap.authorityDocument && !versionedKeys.has('authority_document') && application?.representative?.authorityDocumentUrl && proposedProfile.representative.isAuthorizedRepresentative) {
      proposedDocuments.push({ requirementKey: 'authority_document', label: 'Proof of Authority', documentUrl: application.representative.authorityDocumentUrl, hasExpiration: false, requiredForOperation: true, taxAffecting: false });
    }
    if (!request) request = new StoreComplianceRequest({ store: store._id, owner: req.user._id, sourceApplication: application?._id });
    request.set({ requestType, status: 'pending_review', reason: String(req.body.reason).trim(), currentSnapshot: current, proposedProfile, proposedDocuments, submittedAt: new Date(), submittedBy: req.user._id, requiredCorrections: [], correctionReason: '' });
    request.reviewHistory.push({ action: isCorrection ? 'resubmitted' : 'submitted', actor: req.user._id, notes: String(req.body.reason).trim() });
    await request.save();
    store.businessCompliance = store.businessCompliance || {};
    store.businessCompliance.currentRequest = request._id;
    store.businessCompliance.status = 'pending_review';
    store.businessCompliance.lastSubmittedAt = new Date();
    store.businessCompliance.auditTrail.push({ event: isCorrection ? 'request_resubmitted' : 'request_submitted', actor: req.user._id, at: new Date(), reason: request.reason, request: request._id });
    store.taxProfile.updateRequestStatus = 'pending';
    store.taxProfile.updateRequestedAt = new Date();
    store.markModified('businessCompliance');
    await store.save();
    const admins = await User.find({ role: { $in: ['super_admin', 'platform_admin'] }, isActive: { $ne: false }, isDeleted: { $ne: true } }).select('_id');
    await Promise.all(admins.map(admin => createNotification({ recipient: admin._id, type: 'store_application', title: 'Business & Tax review required', message: `${store.name} submitted a ${requestType.replace(/_/g, ' ')} request.`, relatedId: request._id, relatedModel: 'StoreComplianceRequest', targetUrl: `/superadmin/store-applications?compliance=${request._id}` }, req.app.get('socketio'))));
    res.status(isCorrection ? 200 : 201).json({ message: isCorrection ? 'Corrections resubmitted for review.' : 'Business & Tax update submitted for review.', request: safeRequest(request) });
  } catch (error) {
    console.error('Submit compliance request error:', error);
    res.status(error.code === 11000 ? 409 : 500).json({ message: error.code === 11000 ? 'A Business & Tax request is already active.' : 'Unable to submit Business & Tax information.' });
  }
};

const listComplianceRequests = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.requestType) filter.requestType = req.query.requestType;
    const rows = await StoreComplianceRequest.find(filter).sort({ submittedAt: -1 }).populate('store', 'name verificationStatus isActive').populate('owner', 'firstName lastName email role');
    res.json({ requests: rows.map(row => safeRequest(row)) });
  } catch (error) { res.status(500).json({ message: 'Unable to load compliance requests.' }); }
};

const getComplianceRequest = async (req, res) => {
  try {
    const request = await privateRequestQuery(StoreComplianceRequest.findById(req.params.id)).populate('store', 'name verificationStatus isActive businessProfile taxProfile businessCompliance').populate('owner', 'firstName lastName email role');
    if (!request) return res.status(404).json({ message: 'Compliance request not found.' });
    res.json({ request: safeRequest(request) });
  } catch (_) { res.status(500).json({ message: 'Unable to load compliance request.' }); }
};

const getComplianceDocument = async (req, res) => {
  try {
    const request = await privateRequestQuery(StoreComplianceRequest.findById(req.params.id));
    if (!request) return res.status(404).json({ message: 'Compliance request not found.' });
    if (!isPlatformAdmin(req.user) && String(request.owner) !== String(req.user._id)) return res.status(403).json({ message: 'Access denied.' });
    const document = request.proposedDocuments.id(req.params.documentId);
    if (!document?.documentUrl) return res.status(404).json({ message: 'Document not found.' });
    res.json({ url: document.documentUrl, name: document.originalName || document.label });
  } catch (_) { res.status(500).json({ message: 'Unable to open document.' }); }
};

const addVersion = ({ store, request, proposedDocument, reviewer, now }) => {
  const compliance = store.businessCompliance || (store.businessCompliance = {});
  let document = (compliance.documents || []).find(row => row.requirementKey === proposedDocument.requirementKey);
  if (!document) {
    compliance.documents.push({ requirementKey: proposedDocument.requirementKey, label: proposedDocument.label, requiredForOperation: proposedDocument.requiredForOperation, taxAffecting: proposedDocument.taxAffecting, currentVersion: 0, versions: [] });
    document = compliance.documents[compliance.documents.length - 1];
  }
  const prior = currentDocumentVersionLocal(document);
  if (prior) { prior.verificationStatus = 'superseded'; prior.supersededAt = now; }
  const version = Number(document.currentVersion || 0) + 1;
  document.currentVersion = version;
  document.label = proposedDocument.label;
  document.requiredForOperation = proposedDocument.requiredForOperation;
  document.taxAffecting = proposedDocument.taxAffecting;
  document.versions.push({
    version, documentUrl: proposedDocument.documentUrl, originalName: proposedDocument.originalName, mimeType: proposedDocument.mimeType,
    size: proposedDocument.size, issueDate: proposedDocument.issueDate, hasExpiration: proposedDocument.hasExpiration,
    expirationDate: proposedDocument.hasExpiration ? proposedDocument.expirationDate : undefined,
    verificationStatus: 'verified', submittedAt: request.submittedAt, submittedBy: request.submittedBy,
    verifiedAt: now, verifiedBy: reviewer, sourceRequest: request._id
  });
};
const currentDocumentVersionLocal = document => (document.versions || []).find(version => Number(version.version) === Number(document.currentVersion) && version.verificationStatus === 'verified');

const reviewComplianceRequest = async (req, res) => {
  try {
    const request = await privateRequestQuery(StoreComplianceRequest.findById(req.params.id));
    if (!request) return res.status(404).json({ message: 'Compliance request not found.' });
    if (!['pending_review', 'under_review', 'needs_correction'].includes(request.status)) return res.status(409).json({ message: 'This request has already been finalized.' });
    const decision = req.body.decision;
    if (!['approved', 'needs_correction', 'rejected'].includes(decision)) return res.status(400).json({ message: 'Choose approve, needs correction, or reject.' });
    const notes = String(req.body.notes || '').trim();
    if (decision !== 'approved' && notes.length < 5) return res.status(400).json({ message: 'Add a clear correction or rejection reason.' });
    const store = await privateStoreQuery(Store.findById(request.store));
    if (!store) return res.status(404).json({ message: 'Store not found.' });
    const now = new Date();
    if (decision === 'approved') {
      const alreadyExpired = (request.proposedDocuments || []).find(document => document.requiredForOperation && document.hasExpiration && document.expirationDate && new Date(document.expirationDate) <= now);
      if (alreadyExpired) return res.status(400).json({ message: `${alreadyExpired.label} is already expired. Request a current replacement document.` });
      const proposed = request.proposedProfile || {};
      const tax = proposed.tax || {};
      if (tax.birRegistrationStatus === 'registered' && !TAX_STATUSES.includes(req.body.verifiedTaxStatus)) return res.status(400).json({ message: 'Explicitly verify the Store as VAT or Non-VAT.' });
      if (tax.birRegistrationStatus === 'registered' && tax.declaredTaxStatus !== req.body.verifiedTaxStatus && notes.length < 5) {
        return res.status(400).json({ message: 'The verified tax decision differs from the Store declaration. Record the documentary basis in review notes.' });
      }
      store.businessProfile = {
        ...store.businessProfile?.toObject?.() || store.businessProfile,
        registeredBusinessName: proposed.business?.registeredBusinessName,
        tradeName: proposed.business?.tradeName,
        legalStructure: proposed.business?.legalStructure,
        natureOfBusiness: proposed.business?.natureOfBusiness,
        registrationAuthority: proposed.business?.registrationAuthority,
        registrationNumber: proposed.business?.registrationNumber,
        registrationDate: proposed.business?.registrationDate || undefined,
        registrationExpirationDate: proposed.business?.registrationExpirationDate || undefined,
        registeredAddress: proposed.business?.registeredAddress,
        registrationVerified: true,
        sourceApplication: request.sourceApplication
      };
      store.businessCompliance.representative = proposed.representative || {};
      const verifiedTaxStatus = tax.birRegistrationStatus === 'registered' ? req.body.verifiedTaxStatus : null;
      store.taxProfile.birRegistered = tax.birRegistrationStatus === 'registered';
      store.taxProfile.declaredTaxStatus = tax.declaredTaxStatus || null;
      store.taxProfile.verifiedTaxStatus = verifiedTaxStatus;
      store.taxProfile.verificationStatus = verifiedTaxStatus ? 'verified' : 'unverified';
      store.taxProfile.tin = tax.tin || undefined;
      store.taxProfile.branchCode = tax.branchCode || undefined;
      store.taxProfile.registeredName = tax.registeredName || undefined;
      store.taxProfile.registeredAddress = tax.registeredAddress || undefined;
      store.taxProfile.lineOfBusiness = tax.lineOfBusiness || undefined;
      store.taxProfile.verifiedAt = verifiedTaxStatus ? now : undefined;
      store.taxProfile.verifiedBy = verifiedTaxStatus ? req.user._id : undefined;
      store.taxProfile.verificationNotes = notes;
      store.taxProfile.rejectionReason = '';
      store.taxProfile.updateRequestStatus = 'resolved';
      store.taxConfiguration.isConfigured = Boolean(verifiedTaxStatus);
      store.taxConfiguration.taxStatus = verifiedTaxStatus === 'vat_registered' ? 'vat_registered' : 'non_vat';
      store.taxConfiguration.pricingMode = 'inclusive';
      store.taxConfiguration.vatRatePercent = verifiedTaxStatus === 'vat_registered' ? 12 : 0;
      store.taxConfiguration.configuredAt = now;
      store.taxConfiguration.configuredBy = req.user._id;
      for (const document of request.proposedDocuments || []) addVersion({ store, request, proposedDocument: document, reviewer: req.user._id, now });
      store.businessCompliance.status = 'verified';
      store.businessCompliance.lastReviewedAt = now;
      store.businessCompliance.lastVerifiedAt = now;
      store.businessCompliance.currentRequest = undefined;
      store.businessCompliance.auditTrail.push({ event: 'request_approved', actor: req.user._id, at: now, reason: notes, request: request._id });
    } else {
      store.businessCompliance.status = decision === 'needs_correction' ? 'needs_correction' : (store.taxProfile?.verificationStatus === 'verified' ? 'verified' : 'unverified');
      store.businessCompliance.lastReviewedAt = now;
      store.businessCompliance.auditTrail.push({ event: decision, actor: req.user._id, at: now, reason: notes, request: request._id });
      if (decision === 'rejected') {
        store.businessCompliance.currentRequest = undefined;
        store.taxProfile.updateRequestStatus = 'resolved';
      }
    }
    request.status = decision;
    request.reviewNotes = notes;
    request.correctionReason = decision === 'needs_correction' ? notes : '';
    request.requiredCorrections = decision === 'needs_correction' ? (Array.isArray(req.body.requiredCorrections) ? req.body.requiredCorrections : []) : [];
    request.reviewedAt = now;
    request.reviewedBy = req.user._id;
    request.reviewHistory.push({ action: decision, actor: req.user._id, notes, at: now });
    store.markModified('businessProfile'); store.markModified('taxProfile'); store.markModified('taxConfiguration'); store.markModified('businessCompliance');
    await Promise.all([request.save(), store.save()]);
    if (decision === 'approved') await syncExpirationRestrictions(store, now);
    await ActivityLog.create({ user: req.user._id, action: `store_compliance_${decision}`, details: `${store.name}: ${request._id}${notes ? ` — ${notes}` : ''}`, ipAddress: req.ip });
    await createNotification({ recipient: request.owner, type: 'store_application', title: decision === 'approved' ? 'Business & Tax information verified' : decision === 'needs_correction' ? 'Business & Tax correction required' : 'Business & Tax request rejected', message: decision === 'approved' ? 'Your approved information is now authoritative for future transactions.' : notes, relatedId: request._id, relatedModel: 'StoreComplianceRequest', targetUrl: '/admin/settings?section=tax' }, req.app.get('socketio'));
    res.json({ message: `Compliance request ${decision.replace('_', ' ')}.`, request: safeRequest(request), compliance: getComplianceSummary(store) });
  } catch (error) {
    console.error('Review compliance request error:', error);
    res.status(500).json({ message: 'Unable to review compliance request.' });
  }
};

module.exports = { getMyCompliance, getCurrentComplianceDocument, submitComplianceRequest, listComplianceRequests, getComplianceRequest, getComplianceDocument, reviewComplianceRequest };
