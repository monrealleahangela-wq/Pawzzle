const LeaveRequest = require('../models/LeaveRequest');

const dateKey = value => new Date(value).toISOString().slice(0, 10);
const scheduledDays = ({ startDate, endDate, workDays = [1, 2, 3, 4, 5] }) => {
  const start = new Date(`${dateKey(startDate)}T00:00:00Z`);
  const end = new Date(`${dateKey(endDate)}T00:00:00Z`);
  let total = 0;
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (workDays.includes(cursor.getUTCDay())) total += 1;
  }
  return total;
};

const scheduledDaysInYear = ({ startDate, endDate, year, workDays }) => {
  const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);
  const yearEnd = new Date(`${year}-12-31T23:59:59.999Z`);
  const boundedStart = new Date(Math.max(new Date(startDate).getTime(), yearStart.getTime()));
  const boundedEnd = new Date(Math.min(new Date(endDate).getTime(), yearEnd.getTime()));
  if (boundedStart > boundedEnd) return 0;
  return scheduledDays({ startDate: boundedStart, endDate: boundedEnd, workDays });
};

const leaveBalances = async ({ store, employee, year = new Date().getUTCFullYear(), session }) => {
  const policies = (store.hrSettings?.leaveTypes || []).filter(type => type.active);
  let query = LeaveRequest.find({
    store: store._id, employee, status: { $in: ['pending', 'approved'] },
    startDate: { $lte: new Date(`${year}-12-31T23:59:59.999Z`) },
    endDate: { $gte: new Date(`${year - 1}-01-01T00:00:00.000Z`) }
  }).lean();
  if (session) query = query.session(session);
  const leaves = await query;
  return policies.map(policy => {
    const annualCredits = policy.annualCredits == null ? null : Number(policy.annualCredits);
    const workDays = store.hrSettings?.defaultWorkDays;
    const matching = leaves.filter(item => item.leaveTypeKey === policy.key);
    const usedFor = (targetYear, status) => matching
      .filter(item => item.status === status)
      .reduce((sum, item) => sum + scheduledDaysInYear({
        startDate: item.startDate,
        endDate: item.endDate,
        year: targetYear,
        workDays
      }), 0);
    const approvedUsed = usedFor(year, 'approved');
    const pending = usedFor(year, 'pending');
    const priorApprovedUsed = usedFor(year - 1, 'approved');
    const carryOverLimit = Number(policy.carryOverLimit || 0);
    const priorUnused = annualCredits == null ? 0 : Math.max(0, annualCredits - priorApprovedUsed);
    const carryOver = annualCredits == null ? 0 : Math.min(priorUnused, carryOverLimit);
    const entitlement = annualCredits == null ? null : annualCredits + carryOver;
    return {
      key: policy.key, name: policy.name, isPaid: policy.isPaid, annualCredits, entitlement,
      approvedUsed, pending, remaining: entitlement == null ? null : Math.max(0, entitlement - approvedUsed),
      availableAfterPending: entitlement == null ? null : Math.max(0, entitlement - approvedUsed - pending),
      carryOver, carryOverLimit, year
    };
  });
};

module.exports = { leaveBalances, scheduledDays, scheduledDaysInYear };
