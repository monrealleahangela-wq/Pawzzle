const path = require('path');

const REASON_CATEGORIES = new Set([
  'forgot_before_leaving',
  'device_or_internet',
  'application_malfunction',
  'other'
]);
const EVIDENCE_TTL_SECONDS = 5 * 60;

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

const normalizeCorrectionInput = ({ body = {}, attendance, now = new Date() }) => {
  if (!attendance?.timeIn?.at || attendance?.timeOut?.at) throw fail('Only an incomplete attendance session can be corrected.', 409);
  const reasonCategory = String(body.reasonCategory || '').trim();
  const reason = String(body.reason || '').trim();
  if (!REASON_CATEGORIES.has(reasonCategory)) throw fail('Select a valid attendance correction reason.');
  if (reason.length < 10) throw fail('Provide a meaningful correction explanation of at least 10 characters.');
  const proposedTimeOut = new Date(body.proposedTimeOut);
  if (Number.isNaN(proposedTimeOut.getTime())) throw fail('Enter a valid proposed clock-out time.');
  if (proposedTimeOut <= new Date(attendance.timeIn.at)) throw fail('Proposed clock-out must be after the recorded clock-in.');
  if (proposedTimeOut > now) throw fail('Proposed clock-out cannot be in the future.');
  return { reasonCategory, reason, proposedTimeOut };
};

const evidenceFromFile = (file, actorId) => {
  if (!file?.filename || !file?.originalname || !file?.size) throw fail('Supporting evidence is required.');
  const format = String(file.format || path.extname(file.originalname).slice(1)).toLowerCase().replace('jpeg', 'jpg');
  if (!['jpg', 'png', 'webp'].includes(format)) throw fail('Evidence must be a valid JPG, PNG, or WEBP image.');
  if (file.size > 5 * 1024 * 1024) throw fail('Evidence must be 5 MB or smaller.');
  return {
    publicId: file.filename,
    deliveryType: 'authenticated',
    resourceType: 'image',
    format,
    originalName: String(file.originalname).slice(0, 255),
    size: file.size,
    uploadedBy: actorId,
    uploadedAt: new Date()
  };
};

const evidenceMetadata = evidence => evidence ? ({
  originalName: evidence.originalName,
  size: evidence.size,
  uploadedAt: evidence.uploadedAt
}) : null;

const temporaryEvidenceUrl = ({ cloudinary, evidence, now = Date.now() }) => {
  if (!evidence?.publicId || evidence.deliveryType !== 'authenticated') throw fail('Evidence metadata is unavailable.', 409);
  const expiresAt = Math.floor(now / 1000) + EVIDENCE_TTL_SECONDS;
  return {
    url: cloudinary.utils.private_download_url(evidence.publicId, evidence.format, {
      resource_type: 'image', type: 'authenticated', expires_at: expiresAt, attachment: false
    }),
    expiresAt: new Date(expiresAt * 1000).toISOString()
  };
};

module.exports = {
  REASON_CATEGORIES,
  EVIDENCE_TTL_SECONDS,
  normalizeCorrectionInput,
  evidenceFromFile,
  evidenceMetadata,
  temporaryEvidenceUrl
};
