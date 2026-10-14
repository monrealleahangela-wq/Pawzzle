const crypto = require('crypto');
const mongoose = require('mongoose');
const ActivityLog = require('../models/ActivityLog');
const Notification = require('../models/Notification');
const PayrollPaymentAttempt = require('../models/PayrollPaymentAttempt');
const PayrollPeriod = require('../models/PayrollPeriod');
const Payslip = require('../models/Payslip');
const RiderEarning = require('../models/RiderEarning');
const { isPlatformAdmin, isStoreAdmin, normalizeRole } = require('../config/permissions');
const { encryptSensitive, maskAccountNumber, maskReference, sensitiveFingerprint } = require('../utils/payrollPaymentSecurity');

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const sameId = (left, right) => String(left?._id || left || '') === String(right?._id || right || '');
const sameMoney = (left, right) => Math.round(Number(left) * 100) === Math.round(Number(right) * 100);
const ACTIVE_STATUSES = new Set(['processing', 'for_confirmation', 'on_hold']);
const ownerAdminAuthority = actor => isStoreAdmin(actor) || isPlatformAdmin(actor);
const isFinance = actor => normalizeRole(actor) === 'finance_staff';
const TRANSITIONS = {
  processing: new Set(['for_confirmation', 'failed', 'on_hold']),
  for_confirmation: new Set(['failed', 'on_hold']),
  on_hold: new Set(['processing', 'for_confirmation', 'failed']),
  failed: new Set(),
  paid: new Set()
};

const publicAttempt = attempt => ({
  _id: attempt._id,
  attemptId: attempt.attemptId,
  store: attempt.store,
  payrollPeriod: attempt.payrollPeriod,
  payslip: attempt.payslip,
  employee: attempt.employee,
  retryOf: attempt.retryOf,
  amount: attempt.amount,
  currency: attempt.currency,
  externalMethod: attempt.externalMethod,
  referenceMask: attempt.referenceMask,
  transferAt: attempt.transferAt,
  destinationType: attempt.destinationType,
  destinationMask: attempt.destinationMask,
  destinationBank: attempt.destinationBank,
  proof: attempt.proof ? {
    originalName: attempt.proof.originalName,
    mimeType: attempt.proof.mimeType,
    size: attempt.proof.size,
    submittedBy: attempt.proof.submittedBy,
    submittedAt: attempt.proof.submittedAt,
    available: Boolean(attempt.proof.encryptedContent)
  } : null,
  status: attempt.status,
  failureReason: attempt.failureReason,
  holdReason: attempt.holdReason,
  preparedBy: attempt.preparedBy,
  preparedAt: attempt.preparedAt,
  evidenceSubmittedBy: attempt.evidenceSubmittedBy,
  confirmedBy: attempt.confirmedBy,
  confirmedAt: attempt.confirmedAt,
  history: attempt.history || [],
  createdAt: attempt.createdAt,
  updatedAt: attempt.updatedAt
});

const parseProof = (proof, actorId, now) => {
  if (!proof) return undefined;
  const base64 = String(proof.base64 || '').replace(/^data:[^;]+;base64,/i, '').replace(/\s/g, '');
  const originalName = String(proof.originalName || '').trim();
  const mimeType = String(proof.mimeType || '').trim().toLowerCase();
  if (!['image/jpeg', 'image/png', 'application/pdf'].includes(mimeType)) throw fail('Payment proof must be a JPEG, PNG, or PDF file.');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || !base64.length) throw fail('Select a valid payment proof file.');
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw fail('Payment proof must be no larger than 5 MB.');
  const validMagic = mimeType === 'image/jpeg'
    ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : mimeType === 'image/png'
      ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : bytes.subarray(0, 5).toString('ascii') === '%PDF-';
  if (!validMagic) throw fail('The payment proof content does not match its declared file type.');
  if (!originalName || originalName.length > 255) throw fail('Provide a valid payment proof file name.');
  return {
    encryptedContent: encryptSensitive({ base64: bytes.toString('base64'), mimeType }),
    contentFingerprint: sensitiveFingerprint(bytes.toString('base64')),
    originalName,
    mimeType,
    size: bytes.length,
    submittedBy: actorId,
    submittedAt: now
  };
};

const parseInput = (input, payslip, actorId, now) => {
  const status = String(input.status || '').trim();
  if (!['processing', 'for_confirmation'].includes(status)) throw fail('Start an external payment as Processing or For Confirmation.');
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || !sameMoney(amount, payslip.netPay)) throw fail('Payment amount must exactly match this employee’s approved net salary.', 409);
  const externalMethod = String(input.externalMethod || '').trim();
  const supported = ['bank_transfer', 'gcash', 'maya', 'cash', 'cheque', 'other'];
  if (!supported.includes(externalMethod)) throw fail('Select a supported external payment method.');
  const referenceNumber = String(input.referenceNumber || '').trim();
  if (referenceNumber.length < 4 || referenceNumber.length > 160) throw fail('Provide a valid external transfer reference.');
  const transferAt = new Date(input.transferAt);
  if (Number.isNaN(transferAt.getTime())) throw fail('Provide a valid external transfer date and time.');
  const destination = input.destination || {};
  const accountNumber = String(destination.accountNumber || '').trim();
  const accountName = String(destination.accountName || '').trim();
  if (['bank_transfer', 'gcash', 'maya'].includes(externalMethod) && (!accountNumber || !accountName)) {
    throw fail('Payment destination name and account number are required for this transfer method.');
  }
  const proof = parseProof(input.proof, actorId, now);
  if (status === 'for_confirmation' && !proof) throw fail('Attach protected payment proof before requesting independent confirmation.');
  return {
    status,
    amount,
    externalMethod,
    referenceNumber,
    transferAt,
    proof,
    proofFingerprint: proof?.contentFingerprint || '',
    destination: accountNumber || accountName ? {
      type: String(destination.type || externalMethod).trim(),
      bankName: String(destination.bankName || '').trim(),
      accountName,
      accountNumber
    } : null
  };
};

const findPaymentObligations = async (periodId, storeId) => {
  const period = await PayrollPeriod.findOne({ _id: periodId, store: storeId });
  if (!period) throw fail('Payroll period not found.', 404);
  if (!['approved', 'paid'].includes(period.status)) throw fail('Employee payment obligations are available only after payroll approval.', 409);
  const [payslips, attempts] = await Promise.all([
    Payslip.find({ payrollPeriod: period._id, store: storeId }).populate('employee', 'firstName lastName role staffType').sort({ createdAt: 1 }),
    PayrollPaymentAttempt.find({ payrollPeriod: period._id, store: storeId }).select('+proof.encryptedContent').sort({ createdAt: -1 })
  ]);
  const bySlip = new Map();
  attempts.forEach(attempt => {
    const key = String(attempt.payslip);
    if (!bySlip.has(key)) bySlip.set(key, []);
    bySlip.get(key).push(publicAttempt(attempt));
  });
  const paymentRows = payslips.map(slip => ({
    payslip: slip,
    paymentStatus: slip.paymentStatus === 'unpaid' && period.status === 'approved' ? 'pending' : slip.paymentStatus,
    attempts: bySlip.get(String(slip._id)) || []
  }));
  const confirmed = paymentRows.filter(row => row.paymentStatus === 'recorded_paid');
  return {
    period: { _id: period._id, status: period.status, frequency: period.frequency, periodStart: period.periodStart, periodEnd: period.periodEnd, payDate: period.payDate, paymentSummary: period.paymentSummary },
    payments: paymentRows,
    summary: {
      requiredEmployeeCount: paymentRows.length,
      confirmedEmployeeCount: confirmed.length,
      confirmedAmount: confirmed.reduce((sum, row) => sum + Number(row.payslip.netPay || 0), 0),
      outstandingAmount: paymentRows.filter(row => row.paymentStatus !== 'recorded_paid').reduce((sum, row) => sum + Number(row.payslip.netPay || 0), 0)
    }
  };
};

const findEmployeePaymentStatuses = async (employeeId, storeId) => {
  const payslips = await Payslip.find({ employee: employeeId, store: storeId, paymentStatus: { $ne: 'recorded_paid' } })
    .populate({ path: 'payrollPeriod', match: { status: { $in: ['approved', 'paid'] } }, select: 'periodStart periodEnd payDate frequency status' })
    .sort({ createdAt: -1 }).lean();
  const visible = payslips.filter(slip => slip.payrollPeriod);
  if (!visible.length) return [];
  const attempts = await PayrollPaymentAttempt.find({ employee: employeeId, store: storeId, payslip: { $in: visible.map(slip => slip._id) } })
    .sort({ createdAt: -1 }).lean();
  const latest = new Map();
  attempts.forEach(attempt => { if (!latest.has(String(attempt.payslip))) latest.set(String(attempt.payslip), attempt); });
  return visible.map(slip => {
    const attempt = latest.get(String(slip._id));
    return {
      payslipId: slip._id,
      payrollPeriod: slip.payrollPeriod,
      netPay: slip.netPay,
      paymentStatus: attempt?.status || (slip.paymentStatus === 'unpaid' ? 'pending' : slip.paymentStatus),
      externalMethod: attempt?.externalMethod,
      referenceMask: attempt?.referenceMask,
      transferAt: attempt?.transferAt
    };
  });
};

const createPaymentAttempt = async ({ periodId, payslipId, storeId, actor, input, ipAddress }) => {
  let output;
  let requestFingerprint;
  try {
    await mongoose.connection.transaction(async session => {
      const period = await PayrollPeriod.findOne({ _id: periodId, store: storeId }).session(session);
      if (!period) throw fail('Payroll period not found.', 404);
      if (period.status !== 'approved') throw fail('Payroll must be approved before employee payments can be prepared.', 409);
      const payslip = await Payslip.findOne({ _id: payslipId, payrollPeriod: period._id, store: storeId }).session(session);
      if (!payslip) throw fail('Employee payroll obligation not found.', 404);
      if (sameId(payslip.employee, actor._id) && !ownerAdminAuthority(actor)) throw fail('Finance and delegated payroll staff cannot prepare or process their own salary payment.', 403);
      if (payslip.paymentStatus === 'recorded_paid') throw fail('This employee salary is already confirmed Paid.', 409);
      const idempotencyKey = String(input.idempotencyKey || '').trim();
      if (idempotencyKey.length < 8 || idempotencyKey.length > 160) throw fail('A stable idempotency key is required.');
      const now = new Date();
      const normalized = parseInput(input, payslip, actor._id, now);
      const fingerprint = sensitiveFingerprint(JSON.stringify({
        payslip: String(payslip._id), amount: normalized.amount, method: normalized.externalMethod,
        reference: normalized.referenceNumber, transferAt: normalized.transferAt.toISOString(), status: normalized.status,
        destination: normalized.destination, proofFingerprint: normalized.proofFingerprint
      }));
      requestFingerprint = fingerprint;
      const duplicate = await PayrollPaymentAttempt.findOne({ store: storeId, idempotencyKey })
        .select('+idempotencyKey +idempotencyFingerprint').session(session);
      if (duplicate) {
        if (duplicate.idempotencyFingerprint !== fingerprint) throw fail('This idempotency key was used with different payment details.', 409);
        output = { attempt: publicAttempt(duplicate), idempotent: true };
        return;
      }
      const active = await PayrollPaymentAttempt.findOne({ payslip: payslip._id, activeKey: String(payslip._id) }).session(session);
      if (active && ACTIVE_STATUSES.has(active.status)) throw fail('This employee already has a payment attempt in progress.');
      let retryOf;
      if (input.retryOf) {
        const prior = await PayrollPaymentAttempt.findOne({ _id: input.retryOf, payslip: payslip._id, store: storeId, status: 'failed' }).session(session);
        if (!prior) throw fail('Only a failed attempt for this employee can be retried.', 409);
        retryOf = prior._id;
      } else if (payslip.paymentStatus === 'failed') throw fail('A failed payment must be retried as a new linked attempt.', 409);
      if (!['unpaid', 'failed'].includes(payslip.paymentStatus)) throw fail('An active or paid employee payment cannot be replaced.', 409);
      const referenceFingerprint = sensitiveFingerprint(normalized.referenceNumber);
      const destination = normalized.destination;
      const [created] = await PayrollPaymentAttempt.create([{
        idempotencyKey,
        idempotencyFingerprint: fingerprint,
        activeKey: String(payslip._id),
        store: storeId,
        payrollPeriod: period._id,
        payslip: payslip._id,
        employee: payslip.employee,
        retryOf,
        amount: normalized.amount,
        currency: 'PHP',
        externalMethod: normalized.externalMethod,
        encryptedTransferReference: encryptSensitive({ referenceNumber: normalized.referenceNumber }),
        referenceFingerprint,
        referenceMask: maskReference(normalized.referenceNumber),
        transferAt: normalized.transferAt,
        encryptedDestination: destination ? encryptSensitive(destination) : undefined,
        destinationType: destination?.type || normalized.externalMethod,
        destinationMask: destination ? maskAccountNumber(destination.accountNumber) : '',
        destinationBank: destination?.bankName || '',
        proof: normalized.proof,
        status: normalized.status,
        preparedBy: actor._id,
        preparedAt: now,
        evidenceSubmittedBy: actor._id,
        history: [{ fromStatus: 'none', toStatus: normalized.status, actor: actor._id, at: now, reason: retryOf ? 'New audited retry of a failed external transfer.' : 'External transfer reported; no Pawzzle disbursement was initiated.' }]
      }], { session });
      const updated = await Payslip.findOneAndUpdate(
        { _id: payslip._id, store: storeId, paymentStatus: payslip.paymentStatus },
        { $set: { paymentStatus: normalized.status } }, { new: true, session }
      );
      if (!updated) throw fail('Employee payment state changed while recording. Refresh and retry.', 409);
      await ActivityLog.create([{
        user: actor._id, action: 'Payroll payment attempt created',
        details: `Payment attempt ${created.attemptId} created for an employee payroll obligation.`,
        store: storeId, subject: payslip.employee, category: 'payroll',
        changes: { before: { status: payslip.paymentStatus }, after: { status: normalized.status, attemptId: created.attemptId }, effectiveDate: normalized.transferAt, reason: 'External/manual transfer recorded.' }, ipAddress
      }], { session });
      output = { attempt: publicAttempt(created), idempotent: false };
    });
  } catch (error) {
    if (error?.code === 11000) {
      if (requestFingerprint) {
        const duplicate = await PayrollPaymentAttempt.findOne({ store: storeId, idempotencyKey: String(input.idempotencyKey || '').trim() })
          .select('+idempotencyKey +idempotencyFingerprint');
        if (duplicate && duplicate.idempotencyFingerprint === requestFingerprint) return { attempt: publicAttempt(duplicate), idempotent: true };
      }
      throw fail('This transfer reference, request key, or employee payment is already in use.', 409);
    }
    throw error;
  }
  return output;
};

const transitionPaymentAttempt = async ({ attemptId, storeId, actor, input, ipAddress }) => {
  let output;
  try {
    await mongoose.connection.transaction(async session => {
      const attempt = await PayrollPaymentAttempt.findOne({ _id: attemptId, store: storeId })
        .select('+activeKey +proof.encryptedContent').session(session);
      if (!attempt) throw fail('Payroll payment attempt not found.', 404);
      if (sameId(attempt.employee, actor._id) && !ownerAdminAuthority(actor)) throw fail('Finance and delegated payroll staff cannot modify their own salary payment.', 403);
      const nextStatus = String(input.status || '').trim();
      if (attempt.status === nextStatus) return (output = { attempt: publicAttempt(attempt), idempotent: true });
      if (!TRANSITIONS[attempt.status]?.has(nextStatus)) throw fail(`Payment cannot move from ${attempt.status} to ${nextStatus}.`, 409);
      const reason = String(input.reason || '').trim();
      if (reason.length < 5) throw fail('Provide a clear reason for this payment status change.');
      const now = new Date();
      const set = { status: nextStatus };
      if (nextStatus === 'failed') set.failureReason = reason;
      if (nextStatus === 'on_hold') set.holdReason = reason;
      if (['processing', 'for_confirmation'].includes(nextStatus)) set.holdReason = '';
      if (input.proof !== undefined) {
        set.proof = parseProof(input.proof, actor._id, now);
        set.evidenceSubmittedBy = actor._id;
      }
      const proofAvailable = Boolean(set.proof?.encryptedContent || attempt.proof?.encryptedContent);
      if (nextStatus === 'for_confirmation' && !proofAvailable) throw fail('Attach protected payment proof before requesting independent confirmation.');
      const update = { $set: set, $push: { history: { fromStatus: attempt.status, toStatus: nextStatus, actor: actor._id, at: now, reason } } };
      if (nextStatus === 'failed') update.$unset = { activeKey: 1 };
      const claimed = await PayrollPaymentAttempt.findOneAndUpdate(
        { _id: attempt._id, store: storeId, status: attempt.status }, update,
        { new: true, session, runValidators: true }
      ).select('+proof.encryptedContent');
      if (!claimed) throw fail('Payment state changed while it was being updated. Refresh before retrying.', 409);
      const slip = await Payslip.findOneAndUpdate(
        { _id: attempt.payslip, store: storeId, paymentStatus: attempt.status },
        { $set: { paymentStatus: nextStatus } }, { new: true, session }
      );
      if (!slip) throw fail('Payslip payment state changed. No payment update was committed.', 409);
      await ActivityLog.create([{
        user: actor._id, action: `Payroll payment ${nextStatus}`,
        details: `Payment attempt ${attempt.attemptId} moved from ${attempt.status} to ${nextStatus}.`,
        store: storeId, subject: attempt.employee, category: 'payroll',
        changes: { before: { status: attempt.status }, after: { status: nextStatus, attemptId: attempt.attemptId }, effectiveDate: now, reason }, ipAddress
      }], { session });
      output = { attempt: publicAttempt(claimed), idempotent: false };
    });
  } catch (error) {
    if (error?.code === 11000) throw fail('This employee payment is already active or the transfer reference is duplicated.', 409);
    throw error;
  }
  return output;
};

const confirmPaymentAttempt = async ({ attemptId, storeId, actor, reason, ipAddress }) => {
  let output;
  await mongoose.connection.transaction(async session => {
    const attempt = await PayrollPaymentAttempt.findOne({ _id: attemptId, store: storeId })
      .select('+activeKey +proof.encryptedContent').session(session);
    if (!attempt) throw fail('Payroll payment attempt not found.', 404);
    if (attempt.status === 'paid') {
      const period = await PayrollPeriod.findOne({ _id: attempt.payrollPeriod, store: storeId }).session(session);
      return (output = { attempt: publicAttempt(attempt), period, idempotent: true, periodComplete: period?.status === 'paid' });
    }
    if (attempt.status !== 'for_confirmation') throw fail('Only an externally completed payment awaiting confirmation can be confirmed.', 409);
    if (sameId(attempt.employee, actor._id) && (isFinance(actor) || !ownerAdminAuthority(actor))) throw fail('Finance and delegated payroll staff cannot confirm their own salary payment.', 403);
    if ((sameId(attempt.preparedBy, actor._id) || sameId(attempt.evidenceSubmittedBy, actor._id)) && !ownerAdminAuthority(actor)) {
      throw fail('The payment preparer or evidence submitter cannot confirm this transfer.', 403);
    }
    if (!attempt.proof?.encryptedContent) throw fail('Protected payment proof is required before confirmation.', 409);
    const confirmationReason = String(reason || '').trim();
    if (confirmationReason.length < 5) throw fail('Provide a clear independent confirmation reason.');
    const period = await PayrollPeriod.findOne({ _id: attempt.payrollPeriod, store: storeId, status: 'approved' }).session(session);
    if (!period) throw fail('The payroll period is not open for payment confirmation.', 409);
    const payslip = await Payslip.findOne({ _id: attempt.payslip, store: storeId, payrollPeriod: period._id, paymentStatus: 'for_confirmation' }).session(session);
    if (!payslip) throw fail('Employee payment obligation is not awaiting confirmation.', 409);
    if (!sameMoney(attempt.amount, payslip.netPay)) throw fail('The payment amount no longer matches the approved payslip.', 409);
    const now = new Date();
    const confirmed = await PayrollPaymentAttempt.findOneAndUpdate(
      { _id: attempt._id, store: storeId, status: 'for_confirmation' },
      { $set: { status: 'paid', confirmedBy: actor._id, confirmedAt: now }, $unset: { activeKey: 1 }, $push: { history: { fromStatus: 'for_confirmation', toStatus: 'paid', actor: actor._id, at: now, reason: confirmationReason } } },
      { new: true, session, runValidators: true }
    ).select('+proof.encryptedContent');
    if (!confirmed) throw fail('Payment was already confirmed or changed by another request.', 409);
    const paidSlip = await Payslip.findOneAndUpdate(
      { _id: payslip._id, store: storeId, paymentStatus: 'for_confirmation' },
      { $set: {
        paymentStatus: 'recorded_paid', finalizedAt: now,
        paymentRecord: { method: attempt.externalMethod, referenceNumber: attempt.referenceMask, paymentDate: attempt.transferAt, processedBy: attempt.preparedBy, notes: 'External payment independently confirmed in Pawzzle.' }
      } }, { new: true, session }
    );
    if (!paidSlip) throw fail('Payslip changed during confirmation. No changes were committed.', 409);
    for (const addition of (payslip.additions || []).filter(row => row.source === 'rider_earning' && row.sourceId)) {
      const settled = await RiderEarning.findOneAndUpdate(
        { _id: addition.sourceId, store: storeId, payrollPayslip: payslip._id, status: 'processing' },
        { $set: { status: 'paid' } }, { new: true, session }
      );
      if (!settled) throw fail('A Rider earning changed during confirmation. No payment was committed.', 409);
    }
    await Notification.create([{
      recipient: payslip.employee, sender: actor._id, type: 'payroll_update', title: 'Salary payment confirmed',
      message: 'Your external salary payment was confirmed by an authorized Store payroll role. Your finalized payslip is available.',
      relatedId: payslip._id, relatedModel: 'Payslip', targetUrl: '/staff/payslips'
    }], { session });
    await ActivityLog.create([{
      user: actor._id, action: 'Payroll employee payment confirmed',
      details: `Payment attempt ${attempt.attemptId} was confirmed for one employee by an authorized payroll role.`,
      store: storeId, subject: attempt.employee, category: 'payroll',
      changes: { before: { status: 'for_confirmation' }, after: { status: 'paid', attemptId: attempt.attemptId }, effectiveDate: now, reason: confirmationReason }, ipAddress
    }], { session });

    const [requiredEmployeeCount, confirmedEmployeeCount, amountRows] = await Promise.all([
      Payslip.countDocuments({ payrollPeriod: period._id, store: storeId }).session(session),
      Payslip.countDocuments({ payrollPeriod: period._id, store: storeId, paymentStatus: 'recorded_paid' }).session(session),
      Payslip.aggregate([
        { $match: { payrollPeriod: period._id, store: storeId, paymentStatus: 'recorded_paid' } },
        { $group: { _id: null, amount: { $sum: '$netPay' } } }
      ]).session(session)
    ]);
    const periodComplete = requiredEmployeeCount > 0 && confirmedEmployeeCount === requiredEmployeeCount;
    const setPeriod = {
      'paymentSummary.requiredEmployeeCount': requiredEmployeeCount,
      'paymentSummary.confirmedEmployeeCount': confirmedEmployeeCount,
      'paymentSummary.confirmedAmount': amountRows[0]?.amount || 0
    };
    if (periodComplete) Object.assign(setPeriod, {
      status: 'paid', paidBy: actor._id, paidAt: now, 'paymentSummary.completedAt': now,
      paymentRecord: { method: 'per_employee_external_transfers', paymentDate: now, processedBy: actor._id, notes: 'Each employee payment has a separate independent confirmation.' }
    });
    const updatedPeriod = await PayrollPeriod.findOneAndUpdate(
      { _id: period._id, store: storeId, status: 'approved' },
      { $set: setPeriod }, { new: true, session, runValidators: true }
    );
    if (!updatedPeriod) throw fail('Payroll period changed during confirmation. No confirmation was committed.', 409);
    output = { attempt: publicAttempt(confirmed), period: updatedPeriod, idempotent: false, periodComplete };
  });
  return output;
};

const getProtectedProof = async ({ attemptId, storeId }) => {
  const attempt = await PayrollPaymentAttempt.findOne({ _id: attemptId, store: storeId }).select('+proof.encryptedContent');
  if (!attempt?.proof?.encryptedContent) throw fail('Protected payment proof is unavailable.', 404);
  let proof;
  try { proof = require('../utils/payrollPaymentSecurity').decryptSensitive(attempt.proof.encryptedContent); }
  catch (error) { throw error; }
  return { ...proof, originalName: attempt.proof.originalName };
};

const retryFailedAttempt = async ({ priorAttemptId, storeId, actor, input, ipAddress }) => {
  const prior = await PayrollPaymentAttempt.findOne({ _id: priorAttemptId, store: storeId, status: 'failed' });
  if (!prior) throw fail('Only a failed same-Store payment can be retried.', 404);
  return createPaymentAttempt({ periodId: prior.payrollPeriod, payslipId: prior.payslip, storeId, actor, input: { ...input, retryOf: prior._id }, ipAddress });
};

module.exports = {
  confirmPaymentAttempt,
  createPaymentAttempt,
  findEmployeePaymentStatuses,
  findPaymentObligations,
  getProtectedProof,
  publicAttempt,
  retryFailedAttempt,
  transitionPaymentAttempt
};
