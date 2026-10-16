const mongoose = require('mongoose');
const PayrollPeriod = require('../models/PayrollPeriod');

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

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

module.exports = { computePayrollPeriodAtomically };
