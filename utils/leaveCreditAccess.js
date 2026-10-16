const { isStoreAdmin, isOperationalStaff, normalizeRole, hasPermission } = require('../config/permissions');

const idOf = value => String(value?._id || value || '');
const sameId = (left, right) => Boolean(idOf(left)) && idOf(left) === idOf(right);

const canReadEmployeeLeaveCredits = ({ actor, storeId, employeeId }) => {
  if (!actor || !storeId || !employeeId || !sameId(actor.store, storeId)) return false;
  if (sameId(actor._id, employeeId)) return isOperationalStaff(actor)
    || (isStoreAdmin(actor) && hasPermission(actor, 'leave.approve'));
  return isStoreAdmin(actor) && hasPermission(actor, 'leave.approve');
};

const canAuthorizeLeaveCreditAdjustment = ({ actor, independentApprover, storeId, employeeId, reason }) => {
  if (!actor || !independentApprover || !storeId || !employeeId || !String(reason || '').trim()) return false;
  if (!isStoreAdmin(actor) || !isStoreAdmin(independentApprover)) return false;
  if (!hasPermission(actor, 'leave.approve') || !hasPermission(independentApprover, 'leave.approve')) return false;
  if (!sameId(actor.store, storeId) || !sameId(independentApprover.store, storeId)) return false;
  if (sameId(actor._id, independentApprover._id) || sameId(actor._id, employeeId) || sameId(independentApprover._id, employeeId)) return false;
  if (normalizeRole(actor) === 'finance_staff' || normalizeRole(independentApprover) === 'finance_staff') return false;
  return true;
};

const canApproveLeavePolicy = ({ actor, independentReviewer, storeId }) => {
  if (!actor || !independentReviewer || !storeId) return false;
  if (!isStoreAdmin(actor) || !isStoreAdmin(independentReviewer)) return false;
  if (!hasPermission(actor, 'leave.approve') || !hasPermission(independentReviewer, 'leave.approve')) return false;
  if (!sameId(actor.store, storeId) || !sameId(independentReviewer.store, storeId)) return false;
  return !sameId(actor._id, independentReviewer._id)
    && normalizeRole(actor) !== 'finance_staff'
    && normalizeRole(independentReviewer) !== 'finance_staff';
};

module.exports = { canReadEmployeeLeaveCredits, canAuthorizeLeaveCreditAdjustment, canApproveLeavePolicy };
