const mongoose = require('mongoose');
const ActivityLog = require('../models/ActivityLog');
const Notification = require('../models/Notification');
const PayrollPeriod = require('../models/PayrollPeriod');
const Payslip = require('../models/Payslip');
const RiderEarning = require('../models/RiderEarning');
const { normalizeRole } = require('../config/permissions');

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const sameId = (left, right) => String(left?._id || left || '') === String(right?._id || right || '');

const samePayment = (record, payment) => String(record?.method || '') === payment.method
  && String(record?.referenceNumber || '') === payment.referenceNumber;

const finalizePayrollPayment = async ({ periodId, storeId, actor, payment, ipAddress }) => {
  let result;
  await mongoose.connection.transaction(async session => {
    const period = await PayrollPeriod.findOne({ _id: periodId, store: storeId }).session(session);
    if (!period) throw fail('Payroll period not found.', 404);
    if (period.status === 'paid') {
      if (!samePayment(period.paymentRecord, payment)) {
        throw fail('Payroll is already paid under a different external payment record.', 409);
      }
      result = { period, idempotent: true };
      return;
    }
    if (period.status !== 'approved') throw fail('Payroll must be approved before it can be paid.', 409);

    const slips = await Payslip.find({ payrollPeriod: period._id, store: storeId }).session(session);
    if (!slips.length) throw fail('Payroll has no employee payslips to finalize.', 409);
    if (normalizeRole(actor) === 'finance_staff' && slips.some(slip => sameId(slip.employee, actor._id))) {
      throw fail('Finance staff cannot confirm a payroll payment that includes their own salary. A Store Owner or other authorized non-beneficiary must record this external payment.', 403);
    }

    const now = new Date();
    const claimed = await PayrollPeriod.findOneAndUpdate(
      { _id: period._id, store: storeId, status: 'approved' },
      {
        $set: {
          status: 'paid',
          paidBy: actor._id,
          paidAt: now,
          paymentRecord: {
            method: payment.method,
            referenceNumber: payment.referenceNumber,
            paymentDate: payment.paymentDate || now,
            processedBy: actor._id,
            notes: payment.notes || ''
          }
        }
      },
      { new: true, session, runValidators: true }
    );
    if (!claimed) throw fail('Payroll state changed while payment was being recorded. Refresh before trying again.', 409);

    const slipUpdate = await Payslip.updateMany(
      { payrollPeriod: period._id, store: storeId, paymentStatus: 'unpaid' },
      {
        $set: {
          paymentStatus: 'recorded_paid',
          paymentRecord: {
            method: payment.method,
            referenceNumber: payment.referenceNumber,
            paymentDate: payment.paymentDate || now,
            processedBy: actor._id,
            notes: payment.notes || ''
          },
          finalizedAt: now
        }
      },
      { session }
    );
    if (slipUpdate.matchedCount !== slips.length) {
      throw fail('One or more payslips changed while payroll was being finalized. No payment record was committed.', 409);
    }

    const riderClaims = slips.flatMap(slip => (slip.additions || [])
      .filter(item => item.source === 'rider_earning' && item.sourceId)
      .map(item => ({ earningId: item.sourceId, payslipId: slip._id })));
    for (const claim of riderClaims) {
      const settled = await RiderEarning.findOneAndUpdate(
        {
          _id: claim.earningId,
          store: storeId,
          payrollPayslip: claim.payslipId,
          status: 'processing'
        },
        { $set: { status: 'paid' } },
        { new: true, session }
      );
      if (!settled) throw fail('A Rider earning changed while payroll was being finalized. No payment record was committed.', 409);
    }

    await Notification.insertMany(slips.map(slip => ({
      recipient: slip.employee,
      sender: actor._id,
      type: 'payroll_update',
      title: 'Payslip ready',
      message: 'Your payroll was recorded as paid. Your payslip is now available.',
      relatedId: slip._id,
      relatedModel: 'Payslip',
      targetUrl: '/staff/payslips'
    })), { session });
    await ActivityLog.create([{
      user: actor._id,
      action: 'Payroll paid',
      details: `Payroll ${period._id} was atomically recorded as paid by ${actor._id}.`,
      store: storeId,
      category: 'payroll',
      changes: {
        after: { status: 'paid', referenceNumber: payment.referenceNumber },
        effectiveDate: payment.paymentDate || now,
        reason: 'External salary payment recorded.'
      },
      ipAddress
    }], { session });
    result = { period: claimed, idempotent: false };
  });
  return result;
};

module.exports = { finalizePayrollPayment, samePayment };
