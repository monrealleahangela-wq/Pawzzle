const resolveStore = require('../utils/resolveStore');
const { isOperationalStaff, isPlatformAdmin, isStoreAdmin, normalizeRole } = require('../config/permissions');
const { cloudinary } = require('../middleware/upload');
const {
  submitCorrectionRequest,
  listOwnRequests,
  listStoreRequests,
  reviewCorrectionRequest,
  directCorrectAttendance,
  getEvidenceAccess
} = require('../services/attendanceCorrectionService');

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

const safeError = (res, error) => {
  const status = error.statusCode || (error.name === 'ValidationError' ? 400 : 500);
  if (status === 500) console.error('[Attendance correction]', error);
  return res.status(status).json({
    message: status === 500 ? 'Unable to complete the attendance request. Please try again.' : error.message
  });
};

const removeUploadedEvidence = async file => {
  if (!file?.filename) return;
  try {
    await cloudinary.uploader.destroy(file.filename, {
      resource_type: 'image', type: 'authenticated', invalidate: true
    });
  } catch (error) {
    console.error('[Attendance correction] Failed to clean up rejected evidence upload.');
  }
};

const storeIdFor = async req => {
  const storeId = await resolveStore(req);
  if (!storeId) throw fail('A Store assignment is required.', 403);
  return storeId;
};

const requireReviewerRole = user => {
  if (!isPlatformAdmin(user) && !isStoreAdmin(user) && normalizeRole(user) !== 'manager') {
    throw fail('Only an authorized Store manager or owner may review attendance corrections.', 403);
  }
};

const submit = async (req, res) => {
  try {
    if (!isOperationalStaff(req.user) || !req.user.store) throw fail('Attendance correction requests are available only to assigned Store employees.', 403);
    const request = await submitCorrectionRequest({
      actor: req.user,
      attendanceId: req.body.attendanceId,
      input: req.body,
      file: req.file,
      ipAddress: req.ip,
      io: req.app.get('socketio')
    });
    return res.status(201).json({ message: 'Attendance correction request submitted for review.', request });
  } catch (error) {
    await removeUploadedEvidence(req.file);
    return safeError(res, error);
  }
};

const own = async (req, res) => {
  try {
    if (!isOperationalStaff(req.user) || !req.user.store) throw fail('Attendance correction requests are available only to assigned Store employees.', 403);
    return res.json({ requests: await listOwnRequests(req.user) });
  } catch (error) { return safeError(res, error); }
};

const storeList = async (req, res) => {
  try {
    requireReviewerRole(req.user);
    const storeId = await storeIdFor(req);
    return res.json({ requests: await listStoreRequests({ storeId, status: req.query.status }) });
  } catch (error) { return safeError(res, error); }
};

const review = async (req, res) => {
  try {
    requireReviewerRole(req.user);
    const storeId = await storeIdFor(req);
    const request = await reviewCorrectionRequest({
      actor: req.user,
      storeId,
      requestId: req.params.id,
      action: req.body.action,
      reviewerNote: req.body.reviewerNote,
      ipAddress: req.ip,
      io: req.app.get('socketio')
    });
    return res.json({ message: `Attendance correction ${request.status}.`, request });
  } catch (error) { return safeError(res, error); }
};

const directCorrection = async (req, res) => {
  try {
    requireReviewerRole(req.user);
    const storeId = await storeIdFor(req);
    const result = await directCorrectAttendance({
      actor: req.user,
      storeId,
      attendanceId: req.params.id,
      input: req.body,
      ipAddress: req.ip,
      io: req.app.get('socketio')
    });
    return res.json({
      message: result.payrollImpact.manualReconciliationRequired
        ? 'Attendance corrected. A finalized payroll requires separate manual reconciliation.'
        : 'Attendance corrected and affected draft payroll marked for recomputation.',
      ...result
    });
  } catch (error) { return safeError(res, error); }
};

const evidence = async (req, res) => {
  try {
    const storeId = isPlatformAdmin(req.user) ? undefined : await storeIdFor(req);
    const access = await getEvidenceAccess({ actor: req.user, storeId, requestId: req.params.id, cloudinary });
    res.set('Cache-Control', 'private, no-store');
    return res.json(access);
  } catch (error) { return safeError(res, error); }
};

module.exports = { submit, own, storeList, review, directCorrection, evidence };
