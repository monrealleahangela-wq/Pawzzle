const { hasPermission, normalizeRole } = require('../config/permissions');

const sameId = (left, right) => String(left?._id || left || '') === String(right?._id || right || '');

const financeSelfReviewDenied = (actor, employeeId) =>
  normalizeRole(actor) === 'finance_staff' && sameId(employeeId, actor?._id);

const canReadSensitiveLeave = actor =>
  normalizeRole(actor) !== 'finance_staff' && hasPermission(actor, 'leave.approve');

const projectLeaveForStore = (leave, includeSensitive = false) => {
  const item = leave?.toObject ? leave.toObject() : { ...leave };
  delete item.attachmentUrl;
  if (!includeSensitive) {
    delete item.reason;
    delete item.reviewComment;
    delete item.cancellationComment;
    if (Array.isArray(item.history)) item.history = item.history.map(event => ({ ...event, comment: '' }));
  }
  return item;
};

module.exports = { financeSelfReviewDenied, canReadSensitiveLeave, projectLeaveForStore };
