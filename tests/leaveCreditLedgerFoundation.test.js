const assert = require('node:assert/strict');
const test = require('node:test');
const LeavePolicyVersion = require('../models/LeavePolicyVersion');
const LeaveCreditLedgerEntry = require('../models/LeaveCreditLedgerEntry');
const LeaveRequest = require('../models/LeaveRequest');
const ledger = require('../services/leaveCreditLedgerService');
const access = require('../utils/leaveCreditAccess');

const basePolicy = (overrides = {}) => ({
  _id: 'policy-1', store: 'store-1', leaveTypeKey: 'vacation', version: 1,
  scopeType: 'store', scopeKey: 'all', classification: 'employer_provided', status: 'draft',
  effectiveFrom: new Date('2026-01-01T00:00:00Z'), effectiveThrough: null,
  eligibility: {}, unitsPerDay: 480, paidTreatment: 'paid',
  accrual: { mode: 'none' }, carryover: { enabled: false }, createdBy: 'owner-1',
  ...overrides
});
const approvedPolicy = () => {
  const policy = basePolicy({ status: 'active', approvalEvidence: {
    businessApprovedBy: 'owner-1', complianceReviewedBy: 'reviewer-1', complianceQualificationReference: 'synthetic reviewer credential', approvedAt: new Date('2026-01-01'),
    effectiveApprovedAt: new Date('2026-01-01'), approvalReference: 'Synthetic unit-test evidence'
  } });
  policy.approvedSnapshot = ledger.policySnapshotPayload(policy);
  policy.checksum = ledger.calculatePolicyChecksum(policy.approvedSnapshot);
  return policy;
};
const entry = (overrides = {}) => ({
  _id: 'entry-1', store: 'store-1', employee: 'employee-1', leaveTypeKey: 'vacation',
  policyVersion: 'policy-1', entryType: 'opening_balance', units: 1000,
  effectiveDate: new Date('2026-01-01T00:00:00Z'), sourceType: 'opening_balance',
  sourceReference: 'ref-1', idempotencyKey: 'key-entry-0001', actor: 'owner-1',
  reason: 'Synthetic fixture only', unitsPerDaySnapshot: 480,
  createdAt: new Date('2026-01-01T00:00:00Z'), ...overrides
});

test('leave policies default to inactive draft and preserve effective-dated version identity', async () => {
  const policy = new LeavePolicyVersion({ store: 'aaaaaaaaaaaaaaaaaaaaaaaa', leaveTypeKey: 'vacation', version: 1,
    classification: 'employer_provided', effectiveFrom: '2026-01-01', paidTreatment: 'paid', createdBy: 'bbbbbbbbbbbbbbbbbbbbbbbb' });
  assert.equal(policy.status, 'draft');
  assert.equal(policy.scopeType, 'store');
  assert.equal(policy.unitsPerDay, 480);
  await policy.validate();
  assert.ok(LeavePolicyVersion.schema.indexes().some(([fields, options]) => fields.store && fields.leaveTypeKey && fields.version && options.unique));
});

test('pre-ledger leave requests retain their original paid/unpaid snapshot without a policy reference', async () => {
  const legacy = new LeaveRequest({ store: 'aaaaaaaaaaaaaaaaaaaaaaaa', employee: 'bbbbbbbbbbbbbbbbbbbbbbbb',
    leaveTypeKey: 'vacation', leaveTypeName: 'Vacation Leave', isPaid: true,
    startDate: new Date('2025-06-01T00:00:00Z'), endDate: new Date('2025-06-02T00:00:00Z'),
    reason: 'Synthetic historical record', status: 'approved' });
  await legacy.validate();
  assert.equal(legacy.isPaid, true);
  assert.equal(legacy.policyVersion, undefined);
  assert.equal(legacy.status, 'approved');
});

test('policy validation requires explicit fixed accrual/carryover settings and independent active approval evidence', async () => {
  const fixed = new LeavePolicyVersion({ store: 'aaaaaaaaaaaaaaaaaaaaaaaa', leaveTypeKey: 'vacation', version: 1,
    classification: 'employer_provided', effectiveFrom: '2026-01-01', paidTreatment: 'paid', createdBy: 'bbbbbbbbbbbbbbbbbbbbbbbb',
    accrual: { mode: 'fixed_periodic' }, carryover: { enabled: true } });
  await assert.rejects(fixed.validate(), error => Boolean(error.errors.accrual && error.errors['carryover.maximumUnits']));
  const sameApprover = basePolicy({ status: 'active', approvalEvidence: {
    businessApprovedBy: 'approver-1', complianceReviewedBy: 'approver-1', approvedAt: new Date(), effectiveApprovedAt: new Date(), approvalReference: 'review'
  }, approvedSnapshot: {}, checksum: 'x' });
  await assert.rejects(new LeavePolicyVersion(sameApprover).validate(), error => Boolean(error.errors['approvalEvidence.complianceReviewedBy']));
});

test('active policy overlap is rejected by Store, leave type, intersecting scope, and inclusive effective dates', () => {
  const active = approvedPolicy();
  assert.equal(ledger.assertNoOverlappingActivePolicy(basePolicy({ ...active, status: 'draft' }), [active]), true);
  const candidate = basePolicy({ ...active, _id: 'policy-2', status: 'active', version: 2, effectiveFrom: new Date('2026-12-31T00:00:00Z') });
  candidate.approvedSnapshot = ledger.policySnapshotPayload(candidate);
  candidate.checksum = ledger.calculatePolicyChecksum(candidate.approvedSnapshot);
  assert.throws(() => ledger.assertNoOverlappingActivePolicy(candidate, [active]), { code: 'overlapping_active_leave_policy' });
  const otherStore = basePolicy({ ...active, _id: 'policy-3', status: 'active', store: 'store-2', version: 2 });
  otherStore.approvedSnapshot = ledger.policySnapshotPayload(otherStore);
  otherStore.checksum = ledger.calculatePolicyChecksum(otherStore.approvedSnapshot);
  assert.equal(ledger.assertNoOverlappingActivePolicy(otherStore, [active]), true);
  assert.throws(() => ledger.validatePolicyIntegrity({ ...active, checksum: 'tampered' }), { code: 'leave_policy_integrity_mismatch' });
  assert.equal(ledger.selectActiveLeavePolicy({ policies: [active], storeId: 'store-1', leaveTypeKey: 'vacation', applicableDate: '2026-04-01' }).version, 1);
  assert.throws(() => ledger.selectActiveLeavePolicy({ policies: [active], storeId: 'store-1', leaveTypeKey: 'vacation', applicableDate: '2025-12-31' }), { code: 'active_leave_policy_missing' });
});

test('approval snapshot requires distinct approvers and is integrity checked', () => {
  assert.throws(() => ledger.buildApprovedPolicySnapshot(basePolicy(), { businessApprovedBy: 'same', complianceReviewedBy: 'same' }), { code: 'independent_policy_approval_required' });
  const result = ledger.buildApprovedPolicySnapshot(basePolicy(), { businessApprovedBy: 'owner-1', complianceReviewedBy: 'reviewer-1' });
  assert.match(result.checksum, /^[a-f0-9]{64}$/);
  const active = basePolicy({ status: 'active', approvalEvidence: {
    businessApprovedBy: 'owner-1', complianceReviewedBy: 'reviewer-1', complianceQualificationReference: 'synthetic reviewer credential', approvedAt: new Date('2026-01-01'),
    effectiveApprovedAt: new Date('2026-01-01'), approvalReference: 'Synthetic approval'
  }, approvedSnapshot: result.snapshot, checksum: result.checksum });
  assert.equal(ledger.validatePolicyIntegrity(active), true);
});

test('policy activation rejects missing source and reviewer evidence before any write', async () => {
  await assert.rejects(ledger.activateLeavePolicyVersion({
    policyId: 'aaaaaaaaaaaaaaaaaaaaaaaa', actorId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
    complianceReviewerId: 'cccccccccccccccccccccccc', approvalReference: 'review-1',
    effectiveDate: '2026-01-01'
  }), error => error.code === 'leave_policy_activation_input_invalid');
  assert.equal(LeavePolicyVersion.schema.path('sourceReferences').instance, 'Array');
});

test('ledger model uses exact integer minutes and declares idempotency and semantic unique indexes', async () => {
  const valid = new LeaveCreditLedgerEntry({ store: 'aaaaaaaaaaaaaaaaaaaaaaaa', employee: 'bbbbbbbbbbbbbbbbbbbbbbbb', leaveTypeKey: 'vacation',
    policyVersion: 'cccccccccccccccccccccccc', entryType: 'accrual', units: 60, effectiveDate: new Date(), sourceType: 'accrual_period',
    sourceReference: 'dddddddddddddddddddddddd', idempotencyKey: 'accrual-2026-01', actor: 'eeeeeeeeeeeeeeeeeeeeeeee',
    reason: 'Synthetic test entry', unitsPerDaySnapshot: 480 });
  await valid.validate();
  const fractional = valid.toObject();
  fractional.units = 1.5;
  await assert.rejects(new LeaveCreditLedgerEntry(fractional).validate(), error => Boolean(error.errors.units));
  const indexes = LeaveCreditLedgerEntry.schema.indexes();
  assert.ok(indexes.some(([fields, options]) => fields.idempotencyKey && options.unique));
  assert.ok(indexes.some(([fields, options]) => options.name === 'one_reservation_per_request' && options.unique));
  assert.ok(indexes.some(([fields, options]) => options.name === 'one_consumption_per_request' && options.unique));
  assert.ok(indexes.some(([fields, options]) => options.name === 'one_reversal_per_entry' && options.unique));
  assert.equal(LeaveCreditLedgerEntry.schema.path('reason').options.maxlength, 1000);
  assert.equal(LeaveCreditLedgerEntry.schema.path('attachmentUrl'), undefined);
});

test('ledger model rejects mutation of an existing entry before any database operation', async () => {
  const doc = new LeaveCreditLedgerEntry({ store: 'aaaaaaaaaaaaaaaaaaaaaaaa', employee: 'bbbbbbbbbbbbbbbbbbbbbbbb', leaveTypeKey: 'vacation',
    policyVersion: 'cccccccccccccccccccccccc', entryType: 'opening_balance', units: 60, effectiveDate: new Date(), sourceType: 'opening_balance',
    sourceReference: 'dddddddddddddddddddddddd', idempotencyKey: 'opening-balance-1', actor: 'eeeeeeeeeeeeeeeeeeeeeeee',
    reason: 'Synthetic test entry', unitsPerDaySnapshot: 480 });
  doc.isNew = false;
  await assert.rejects(doc.save(), /append-only/);
});

test('manual adjustment and reversal records require reasoned independent authorization', async () => {
  const data = { store: 'aaaaaaaaaaaaaaaaaaaaaaaa', employee: 'bbbbbbbbbbbbbbbbbbbbbbbb', leaveTypeKey: 'vacation',
    policyVersion: 'cccccccccccccccccccccccc', entryType: 'manual_adjustment', units: 60, effectiveDate: new Date(),
    sourceType: 'manual_adjustment', sourceReference: 'dddddddddddddddddddddddd', idempotencyKey: 'manual-adjustment-1',
    actor: 'eeeeeeeeeeeeeeeeeeeeeeee', reason: 'Audited correction', unitsPerDaySnapshot: 480 };
  await assert.rejects(new LeaveCreditLedgerEntry(data).validate(), error => Boolean(error.errors.authorizedBy));
  await assert.rejects(new LeaveCreditLedgerEntry({ ...data, authorizedBy: data.actor }).validate(), error => Boolean(error.errors.authorizedBy));
  const positive = new LeaveCreditLedgerEntry({ ...data, authorizedBy: 'ffffffffffffffffffffffff' });
  await positive.validate();
  const signed = new LeaveCreditLedgerEntry({ ...data, units: -30, authorizedBy: 'ffffffffffffffffffffffff' });
  await signed.validate();
});

test('leave credit projection reconciles reservation, consumption, release and exact reversals', () => {
  const policy = approvedPolicy();
  const entries = [
    entry(),
    entry({ _id: 'reserve-1', createdAt: new Date('2026-01-02'), entryType: 'reservation', units: 400, sourceType: 'leave_request', sourceReference: 'request-1', idempotencyKey: 'reservation-1' }),
    entry({ _id: 'consume-1', createdAt: new Date('2026-01-03'), entryType: 'consumption', units: 250, sourceType: 'leave_request', sourceReference: 'request-1', idempotencyKey: 'consumption-1' }),
    entry({ _id: 'release-1', createdAt: new Date('2026-01-04'), entryType: 'reservation_release', units: 150, sourceType: 'leave_request', sourceReference: 'request-1', idempotencyKey: 'release-1' }),
    entry({ _id: 'expire-1', createdAt: new Date('2026-01-05'), entryType: 'expiry', units: 100, sourceType: 'expiry_period', sourceReference: 'expiry-1', idempotencyKey: 'expiry-1' }),
    entry({ _id: 'reversal-1', createdAt: new Date('2026-01-06'), entryType: 'reversal', units: 100, sourceType: 'ledger_entry', sourceReference: 'expire-1', reversalOf: 'expire-1', idempotencyKey: 'reversal-1' })
  ];
  const result = ledger.reconcileLeaveCredits({ entries, policies: [policy], leaveRequests: [{ _id: 'request-1' }], storeId: 'store-1', employeeId: 'employee-1', leaveTypeKey: 'vacation' });
  assert.equal(result.totalEarnedUnits, 1000);
  assert.equal(result.reservedUnits, 0);
  assert.equal(result.consumedUnits, 250);
  assert.equal(result.expiredUnits, 0);
  assert.equal(result.availableUnits, 750);
  assert.equal(result.reconciledBalanceUnits, 750);
  assert.equal(result.isReconciled, true);
  assert.deepEqual(result.issues, []);
});

test('projection detects duplicates, orphan requests, bad policy scope, missing reversals and negative balances', () => {
  const result = ledger.reconcileLeaveCredits({
    entries: [
      entry({ entryType: 'accrual', sourceType: 'accrual_period', sourceReference: 'period-1', idempotencyKey: 'accrual-1', units: 10 }),
      entry({ _id: 'second-accrual', entryType: 'accrual', sourceType: 'accrual_period', sourceReference: 'period-1', idempotencyKey: 'accrual-2', units: 10 }),
      entry({ _id: 'duplicate-idempotency', entryType: 'opening_balance', idempotencyKey: 'accrual-1', units: 5 }),
      entry({ _id: 'orphan', entryType: 'reservation', sourceType: 'leave_request', sourceReference: 'missing-request', idempotencyKey: 'orphan-reservation', units: 50 }),
      entry({ _id: 'missing-reversal-target', entryType: 'reversal', sourceType: 'ledger_entry', sourceReference: 'missing-ledger', reversalOf: 'missing-ledger', idempotencyKey: 'bad-reversal', units: 10 }),
      entry({ _id: 'policy-mismatch', policyVersion: 'unknown-policy', entryType: 'consumption', sourceType: 'leave_request', sourceReference: 'missing-request-2', idempotencyKey: 'orphan-consumption', units: 40 })
    ],
    policies: [approvedPolicy()], leaveRequests: [], expectedReversalOfIds: ['some-unreversed-entry'], storeId: 'store-1', employeeId: 'employee-1', leaveTypeKey: 'vacation'
  });
  const codes = new Set(result.issues.map(issue => issue.code));
  assert.ok(codes.has('duplicate_accrual'));
  assert.ok(codes.has('orphan_leave_request'));
  assert.ok(codes.has('missing_reversal_target'));
  assert.ok(codes.has('invalid_policy_reference'));
  assert.ok(codes.has('reservation_exceeded'));
  assert.ok(codes.has('negative_available_balance'));
  assert.ok(codes.has('duplicate_idempotency_key'));
  assert.ok(codes.has('missing_reversal'));
  assert.equal(result.isReconciled, false);
});

test('projection reports duplicate reservations and prevents cross-policy request reconciliation', () => {
  const firstPolicy = approvedPolicy();
  const secondPolicy = approvedPolicy();
  secondPolicy._id = 'policy-2';
  secondPolicy.version = 2;
  secondPolicy.approvedSnapshot = ledger.policySnapshotPayload(secondPolicy);
  secondPolicy.checksum = ledger.calculatePolicyChecksum(secondPolicy.approvedSnapshot);
  const result = ledger.reconcileLeaveCredits({
    entries: [
      entry({ _id: 'request-reservation-a', entryType: 'reservation', units: 60, sourceType: 'leave_request', sourceReference: 'request-1', idempotencyKey: 'request-reservation-a' }),
      entry({ _id: 'request-reservation-b', entryType: 'reservation', units: 60, sourceType: 'leave_request', sourceReference: 'request-1', idempotencyKey: 'request-reservation-b', createdAt: new Date('2026-01-02') }),
      entry({ _id: 'cross-policy-consumption', entryType: 'consumption', units: 60, sourceType: 'leave_request', sourceReference: 'request-1', policyVersion: 'policy-2', idempotencyKey: 'cross-policy-consumption', createdAt: new Date('2026-01-03') })
    ],
    policies: [firstPolicy, secondPolicy], leaveRequests: [{ _id: 'request-1' }], storeId: 'store-1', employeeId: 'employee-1', leaveTypeKey: 'vacation'
  });
  const codes = new Set(result.issues.map(issue => issue.code));
  assert.ok(codes.has('duplicate_reservation'));
  assert.ok(codes.has('cross_policy_reconciliation'));
  assert.equal(result.isReconciled, false);
});

test('authorization is self-only for employees and Store-scoped for administrators; Finance cannot approve or adjust', () => {
  const employee = { _id: 'employee-1', role: 'staff', staffType: 'sales', store: 'store-1' };
  const owner = { _id: 'owner-1', role: 'store_owner', store: 'store-1' };
  const finance = { _id: 'finance-1', role: 'staff', staffType: 'finance_staff', store: 'store-1' };
  const coOwner = { _id: 'owner-2', role: 'store_owner', store: 'store-1' };
  const escalatedManager = { _id: 'manager-1', role: 'manager', store: 'store-1', permissions: { 'leave.approve': true } };
  assert.equal(access.canReadEmployeeLeaveCredits({ actor: employee, storeId: 'store-1', employeeId: 'employee-1' }), true);
  assert.equal(access.canReadEmployeeLeaveCredits({ actor: employee, storeId: 'store-1', employeeId: 'employee-2' }), false);
  assert.equal(access.canReadEmployeeLeaveCredits({ actor: owner, storeId: 'store-2', employeeId: 'employee-2' }), false);
  assert.equal(access.canReadEmployeeLeaveCredits({ actor: finance, storeId: 'store-1', employeeId: 'employee-2' }), false);
  assert.equal(access.canAuthorizeLeaveCreditAdjustment({ actor: owner, independentApprover: owner, storeId: 'store-1', employeeId: 'employee-2', reason: 'x' }), false);
  assert.equal(access.canAuthorizeLeaveCreditAdjustment({ actor: owner, independentApprover: coOwner, storeId: 'store-1', employeeId: 'employee-2', reason: 'correction' }), true);
  assert.equal(access.canAuthorizeLeaveCreditAdjustment({ actor: owner, independentApprover: coOwner, storeId: 'store-1', employeeId: 'owner-1', reason: 'self' }), false);
  assert.equal(access.canAuthorizeLeaveCreditAdjustment({ actor: finance, independentApprover: owner, storeId: 'store-1', employeeId: 'employee-2', reason: 'finance' }), false);
  assert.equal(access.canApproveLeavePolicy({ actor: owner, independentReviewer: coOwner, storeId: 'store-1' }), true);
  assert.equal(access.canApproveLeavePolicy({ actor: owner, independentReviewer: owner, storeId: 'store-1' }), false);
  assert.equal(access.canApproveLeavePolicy({ actor: finance, independentReviewer: owner, storeId: 'store-1' }), false);
  assert.equal(access.canApproveLeavePolicy({ actor: escalatedManager, independentReviewer: owner, storeId: 'store-1' }), false);
  assert.equal(access.canAuthorizeLeaveCreditAdjustment({ actor: escalatedManager, independentApprover: owner, storeId: 'store-1', employeeId: 'employee-2', reason: 'custom grant' }), false);
});

