const mongoose = require('mongoose');
const PayrollPeriod = require('../models/PayrollPeriod');
const Payslip = require('../models/Payslip');

const fail = (message, statusCode = 400, code) => Object.assign(new Error(message), { statusCode, code });

const dateOnly = value => {
  const key = value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
  return new Date(`${key}T00:00:00.000Z`);
};
const endOfDate = value => new Date(dateOnly(value).getTime() + 86399999);

const invalidatePayrollInputForEmployeeDates = async ({ storeId, employeeId, startDate, endDate, session, issueCode, reason }) => {
  const periods = await PayrollPeriod.find({
    store: storeId,
    status: { $in: ['draft', 'computed', 'reviewed'] },
    periodStart: { $lte: endOfDate(endDate) },
    periodEnd: { $gte: dateOnly(startDate) }
  }).session(session);

  for (const period of periods) {
    const hasSlip = await Payslip.exists({
      store: storeId, employee: employeeId, payrollPeriod: period._id
    }).session(session);
    if (period.status !== 'draft' && !hasSlip) continue;
    period.payrollInputRevision = Number(period.payrollInputRevision || 0) + 1;
    if (hasSlip) {
      if (period.status === 'reviewed') {
        period.status = 'computed';
        period.reviewedBy = undefined;
        period.reviewedAt = undefined;
      }
      if (issueCode) {
        period.reviewIssues ||= [];
        if (!period.reviewIssues.some(issue => issue.code === issueCode)) {
          period.reviewIssues.push({ employeeId, code: issueCode, reason, blocking: true });
        }
      }
    }
    await period.save({ session });
  }
};

// Payroll computation and attendance invalidation write the same period
// document. A computation that read stale inputs is retried before publish.
const computePayrollPeriodAtomically = async ({ periodId, storeId, calculate }) => {
  if (typeof calculate !== 'function') throw new TypeError('A payroll calculation callback is required.');
  let outcome;
  await mongoose.connection.transaction(async session => {
    const period = await PayrollPeriod.findOne({ _id: periodId, store: storeId }).session(session);
    if (!period) throw fail('Payroll period not found.', 404);
    if (!['draft', 'computed'].includes(period.status)) throw fail('Only Draft or Computed payroll can be recomputed.', 409);
    const inputRevision = Number(period.payrollInputRevision || 0);
    const result = await calculate({ period, session, inputRevision });
    period.status = 'computed';
    period.computedInputRevision = inputRevision;
    period.attendanceRecalculation = { required: false };
    await period.save({ session });
    outcome = { period, result, inputRevision };
  });
  return outcome;
};

module.exports = { computePayrollPeriodAtomically, invalidatePayrollInputForEmployeeDates };
