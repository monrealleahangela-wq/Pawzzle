const path = require('path');

const EVIDENCE_ACCESS_TTL_SECONDS = 5 * 60;

const plainValue = value => (value?.toObject ? value.toObject() : value);

const inferEvidenceFormat = evidence => {
  if (evidence?.format) return String(evidence.format).toLowerCase().replace(/^jpeg$/, 'jpg');
  for (const candidate of [evidence?.url, evidence?.originalName]) {
    if (!candidate) continue;
    let pathname = String(candidate);
    try { pathname = new URL(pathname).pathname; } catch (_error) { /* local filename */ }
    const extension = path.extname(pathname).slice(1).toLowerCase();
    if (extension) return extension === 'jpeg' ? 'jpg' : extension;
  }
  return null;
};

const evidenceFromUploadedFile = (file, userId) => ({
  url: file.path,
  publicId: file.filename,
  deliveryType: 'authenticated',
  resourceType: 'image',
  format: inferEvidenceFormat({ url: file.path, originalName: file.originalname }),
  originalName: file.originalname,
  size: file.size,
  uploadedBy: userId
});

const toEvidenceMetadata = evidence => {
  const value = plainValue(evidence) || {};
  return {
    _id: value._id,
    originalName: value.originalName,
    size: value.size,
    uploadedBy: value.uploadedBy,
    uploadedAt: value.uploadedAt,
    // Old records have no explicit delivery type and remain Cloudinary `upload`
    // assets until an administrator performs the documented migration.
    legacyPublicAsset: !value.deliveryType || value.deliveryType === 'upload'
  };
};

const sanitizeReceivingReport = report => {
  if (!report) return report;
  const value = plainValue(report);
  return {
    ...value,
    evidence: (value.evidence || []).map(toEvidenceMetadata),
    reinspections: (value.reinspections || []).map(reinspection => ({
      ...plainValue(reinspection),
      evidence: (reinspection.evidence || []).map(toEvidenceMetadata)
    }))
  };
};

const sanitizeOrderReceivingReport = order => {
  const value = plainValue(order);
  if (!value || !value.receivingReport || typeof value.receivingReport !== 'object') return value;
  return { ...value, receivingReport: sanitizeReceivingReport(value.receivingReport) };
};

const findEvidenceById = (report, evidenceId) => {
  if (!report || !evidenceId) return null;
  const matches = evidence => String(evidence?._id) === String(evidenceId);
  const original = (report.evidence || []).find(matches);
  if (original) return original;
  for (const reinspection of report.reinspections || []) {
    const evidence = (reinspection.evidence || []).find(matches);
    if (evidence) return evidence;
  }
  return null;
};

const createTemporaryEvidenceUrl = ({ cloudinary, evidence, now = Date.now() }) => {
  if (!evidence?.publicId) {
    const error = new Error('Evidence asset metadata is incomplete.');
    error.statusCode = 409;
    throw error;
  }
  const format = inferEvidenceFormat(evidence);
  if (!format) {
    const error = new Error('Evidence file format is unavailable.');
    error.statusCode = 409;
    throw error;
  }
  const expiresAt = Math.floor(now / 1000) + EVIDENCE_ACCESS_TTL_SECONDS;
  const deliveryType = evidence.deliveryType || 'upload';
  const url = cloudinary.utils.private_download_url(evidence.publicId, format, {
    resource_type: evidence.resourceType || 'image',
    type: deliveryType,
    expires_at: expiresAt,
    attachment: false
  });
  return {
    url,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
    legacyPublicAsset: deliveryType === 'upload'
  };
};

module.exports = {
  EVIDENCE_ACCESS_TTL_SECONDS,
  inferEvidenceFormat,
  evidenceFromUploadedFile,
  toEvidenceMetadata,
  sanitizeReceivingReport,
  sanitizeOrderReceivingReport,
  findEvidenceById,
  createTemporaryEvidenceUrl
};
