const Store = require('../models/Store');
const { createNotification } = require('../controllers/notificationController');

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_THRESHOLDS = [30, 14, 7, 0];

const configuredThresholds = () => {
  const values = String(process.env.STORE_COMPLIANCE_REMINDER_DAYS || DEFAULT_THRESHOLDS.join(','))
    .split(',').map(value => Number(value.trim())).filter(value => Number.isInteger(value) && value >= 0);
  return [...new Set(values.length ? values : DEFAULT_THRESHOLDS)].sort((a, b) => a - b);
};

const toPlain = value => value?.toObject ? value.toObject() : value;

const evaluateDocumentExpiration = (version, now = new Date()) => {
  const value = toPlain(version) || {};
  if (!value.hasExpiration || !value.expirationDate) return { state: 'valid', daysRemaining: null };
  const expiration = new Date(value.expirationDate);
  if (Number.isNaN(expiration.getTime())) return { state: 'needs_correction', daysRemaining: null };
  const daysRemaining = Math.ceil((expiration.getTime() - now.getTime()) / DAY_MS);
  if (daysRemaining <= 0) return { state: 'expired', daysRemaining };
  const threshold = configuredThresholds().find(days => daysRemaining <= days);
  return threshold === undefined
    ? { state: 'valid', daysRemaining }
    : { state: 'expiring_soon', daysRemaining, thresholdDays: threshold };
};

const currentDocumentVersion = document => {
  const plain = toPlain(document) || {};
  return (plain.versions || []).find(version =>
    Number(version.version) === Number(plain.currentVersion) && version.verificationStatus === 'verified'
  ) || null;
};

const getComplianceSummary = (store, now = new Date()) => {
  const compliance = toPlain(store?.businessCompliance) || {};
  const documents = (compliance.documents || []).map(document => {
    const current = currentDocumentVersion(document);
    const expiration = current ? evaluateDocumentExpiration(current, now) : { state: 'not_submitted', daysRemaining: null };
    return {
      requirementKey: document.requirementKey,
      label: document.label,
      requiredForOperation: Boolean(document.requiredForOperation),
      taxAffecting: Boolean(document.taxAffecting),
      currentVersion: Number(document.currentVersion || 0),
      verificationStatus: current?.verificationStatus || 'not_submitted',
      issueDate: current?.issueDate || null,
      hasExpiration: Boolean(current?.hasExpiration),
      expirationDate: current?.expirationDate || null,
      expirationState: expiration.state,
      daysRemaining: expiration.daysRemaining,
      hasDocument: Boolean(current)
    };
  });
  const expiredRequired = documents.filter(document => document.requiredForOperation && document.expirationState === 'expired');
  const activeRestrictions = (compliance.restrictionReasons || []).filter(reason => reason.active !== false);
  const blockingReasons = [
    ...activeRestrictions.map(reason => ({ code: reason.code, requirementKey: reason.requirementKey, message: reason.notes || 'Store compliance review is required.' })),
    ...expiredRequired.filter(document => !activeRestrictions.some(reason => reason.code === 'expired_required_document' && reason.requirementKey === document.requirementKey))
      .map(document => ({ code: 'expired_required_document', requirementKey: document.requirementKey, message: `${document.label} has expired and must be renewed.` }))
  ];
  const hasExpiring = documents.some(document => document.expirationState === 'expiring_soon');
  const status = blockingReasons.length ? 'restricted'
    : hasExpiring ? 'expiring_soon'
      : (compliance.status || (store?.taxProfile?.verificationStatus === 'verified' ? 'verified' : 'unverified'));
  return { status, documents, blockingReasons, restricted: blockingReasons.length > 0 };
};

const complianceError = summary => {
  const expired = summary.blockingReasons.find(reason => reason.code === 'expired_required_document');
  const error = new Error(expired
    ? 'This store is temporarily unable to accept new transactions until a required business document is renewed.'
    : 'This store is temporarily unable to accept new transactions while its compliance status is under review.');
  error.code = expired ? 'STORE_COMPLIANCE_DOCUMENT_EXPIRED' : 'STORE_COMPLIANCE_RESTRICTED';
  error.statusCode = 409;
  return error;
};

const assertStoreTransactionEligible = (store, { requireTax = true, now = new Date() } = {}) => {
  if (!store || store.isDeleted || store.isActive === false || store.verificationStatus !== 'verified') {
    const error = new Error('This store is not currently available for new transactions.');
    error.code = 'STORE_UNAVAILABLE';
    error.statusCode = 409;
    throw error;
  }
  const summary = getComplianceSummary(store, now);
  if (summary.restricted) throw complianceError(summary);
  if (requireTax && (store.taxProfile?.verificationStatus !== 'verified' || store.taxConfiguration?.isConfigured !== true)) {
    const error = new Error("Payment is unavailable until the Store's tax information is verified.");
    error.code = 'STORE_TAX_VERIFICATION_REQUIRED';
    error.statusCode = 409;
    throw error;
  }
  return summary;
};

const syncExpirationRestrictions = async (store, now = new Date()) => {
  const compliance = store.businessCompliance || (store.businessCompliance = {});
  if (!Array.isArray(compliance.restrictionReasons)) compliance.restrictionReasons = [];
  if (!Array.isArray(compliance.auditTrail)) compliance.auditTrail = [];
  const summary = getComplianceSummary(store, now);
  const expiredKeys = new Set(summary.documents
    .filter(document => document.requiredForOperation && document.expirationState === 'expired')
    .map(document => document.requirementKey));
  let changed = false;
  for (const key of expiredKeys) {
    if (!compliance.restrictionReasons.some(reason => reason.active !== false && reason.code === 'expired_required_document' && reason.requirementKey === key)) {
      compliance.restrictionReasons.push({ code: 'expired_required_document', requirementKey: key, active: true, appliedAt: now, notes: 'A required verified business document expired.' });
      compliance.auditTrail.push({ event: 'restriction_applied', systemActor: 'store_compliance_monitor', at: now, reason: 'Required document expired.', requirementKey: key });
      changed = true;
    }
  }
  for (const reason of compliance.restrictionReasons) {
    if (reason.code === 'expired_required_document' && reason.active !== false && !expiredKeys.has(reason.requirementKey)) {
      reason.active = false;
      reason.clearedAt = now;
      compliance.auditTrail.push({ event: 'restriction_cleared', systemActor: 'store_compliance_monitor', at: now, reason: 'A verified replacement document is current.', requirementKey: reason.requirementKey });
      changed = true;
    }
  }
  const refreshed = getComplianceSummary(store, now);
  if (compliance.status !== refreshed.status && !['pending_review', 'needs_correction'].includes(compliance.status)) {
    compliance.status = refreshed.status;
    changed = true;
  }
  if (changed) {
    store.markModified('businessCompliance');
    await store.save();
  }
  return { changed, summary: refreshed };
};

const processStoreComplianceExpirations = async io => {
  const now = new Date();
  const horizon = new Date(now.getTime() + Math.max(...configuredThresholds()) * DAY_MS);
  const stores = await Store.find({
    isDeleted: { $ne: true },
    'businessCompliance.documents.versions': { $elemMatch: { verificationStatus: 'verified', hasExpiration: true, expirationDate: { $lte: horizon } } }
  }).select('+businessCompliance.documents.versions.documentUrl owner name businessCompliance taxProfile');
  let notificationsCreated = 0;
  for (const store of stores) {
    const compliance = store.businessCompliance || (store.businessCompliance = {});
    if (!Array.isArray(compliance.reminderLog)) compliance.reminderLog = [];
    for (const document of compliance.documents || []) {
      const version = currentDocumentVersion(document);
      if (!version) continue;
      const expiration = evaluateDocumentExpiration(version, now);
      if (!['expiring_soon', 'expired'].includes(expiration.state)) continue;
      const thresholdDays = expiration.state === 'expired' ? 0 : expiration.thresholdDays;
      if (compliance.reminderLog.some(log => log.requirementKey === document.requirementKey && Number(log.version) === Number(version.version) && Number(log.thresholdDays) === Number(thresholdDays))) continue;
      compliance.reminderLog.push({ requirementKey: document.requirementKey, version: version.version, thresholdDays, sentAt: now });
      await createNotification({
        recipient: store.owner,
        type: 'store_application',
        title: expiration.state === 'expired' ? 'Business document expired' : 'Business document expiring soon',
        message: expiration.state === 'expired'
          ? `${document.label} has expired. Submit a renewal in Business & Tax Information.`
          : `${document.label} expires in ${expiration.daysRemaining} day${expiration.daysRemaining === 1 ? '' : 's'}.`,
        relatedId: store._id,
        relatedModel: 'Store',
        targetUrl: '/admin/settings?section=tax'
      }, io);
      notificationsCreated += 1;
    }
    store.markModified('businessCompliance');
    await store.save();
    await syncExpirationRestrictions(store, now);
  }
  return { storesChecked: stores.length, notificationsCreated };
};

module.exports = {
  DAY_MS,
  configuredThresholds,
  evaluateDocumentExpiration,
  currentDocumentVersion,
  getComplianceSummary,
  assertStoreTransactionEligible,
  syncExpirationRestrictions,
  processStoreComplianceExpirations
};
