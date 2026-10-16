const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const test = require('node:test');
const LeavePolicyVersion = require('../models/LeavePolicyVersion');
const LeaveCreditLedgerEntry = require('../models/LeaveCreditLedgerEntry');
const Store = require('../models/Store');
const User = require('../models/User');
const LeaveRequest = require('../models/LeaveRequest');
const LeavePolicyActivationGuard = require('../models/LeavePolicyActivationGuard');
const ledger = require('../services/leaveCreditLedgerService');
const activationCapability = require('../utils/leavePolicyActivationCapability');

const uri = process.env.MONGODB_TRANSACTION_TEST_URI;
const testName = 'isolated leave-credit policy and ledger persistence invariants';
const testSchema = new mongoose.Schema({}, { strict: false, versionKey: false });

test(testName, { skip: !uri ? 'MONGODB_TRANSACTION_TEST_URI is not configured; isolated MongoDB transaction/index verification skipped.' : false }, async () => {
  let parsed;
  try { parsed = new URL(uri); } catch (_error) { throw new Error('Configured transaction test URI is malformed; refusing database access.'); }
  const databaseName = parsed.pathname.replace(/^\//, '').split('/')[0];
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || parsed.port !== '27018' || parsed.username || parsed.password
    || parsed.searchParams.get('replicaSet') !== 'pawzzleTestRS'
    || !databaseName || !/(^|[_-])test($|[_-])/i.test(databaseName) || /(^|[_-])(prod|stag|staging)($|[_-])/i.test(databaseName)) {
    throw new Error('Transaction test URI must select an explicitly named isolated test database; refusing writes.');
  }

  const connection = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 5000 }).asPromise();
  const suffix = crypto.randomBytes(8).toString('hex');
  const collectionNames = {
    policy: `leave_credit_test_policy_${suffix}`,
    ledger: `leave_credit_test_ledger_${suffix}`,
    guard: `leave_credit_test_guard_${suffix}`,
    store: `leave_credit_test_store_${suffix}`,
    user: `leave_credit_test_user_${suffix}`,
    request: `leave_credit_test_request_${suffix}`
  };
  try {
    const hello = await connection.db.admin().command({ hello: 1 });
    if (hello.setName !== 'pawzzleTestRS' || hello.isWritablePrimary !== true
      || hello.me !== '127.0.0.1:27018' || !Array.isArray(hello.hosts)
      || hello.hosts.length !== 1 || hello.hosts[0] !== '127.0.0.1:27018') {
      throw new Error('Configured test MongoDB must be the writable pawzzleTestRS primary; refusing writes.');
    }
    const Policy = connection.model(`LeaveCreditTestPolicy_${suffix}`, LeavePolicyVersion.schema, collectionNames.policy);
    const Entry = connection.model(`LeaveCreditTestLedger_${suffix}`, LeaveCreditLedgerEntry.schema, collectionNames.ledger);
    const Guard = connection.model(`LeaveCreditTestGuard_${suffix}`, LeavePolicyActivationGuard.schema, collectionNames.guard);
    const TestStore = connection.model(`LeaveCreditTestStore_${suffix}`, testSchema, collectionNames.store);
    const TestUser = connection.model(`LeaveCreditTestUser_${suffix}`, testSchema, collectionNames.user);
    const TestLeaveRequest = connection.model(`LeaveCreditTestRequest_${suffix}`, testSchema, collectionNames.request);
    await Promise.all([Policy.createIndexes(), Entry.createIndexes()]);

    const storeId = new mongoose.Types.ObjectId();
    const employeeId = new mongoose.Types.ObjectId();
    const actorId = new mongoose.Types.ObjectId();
    const reviewerId = new mongoose.Types.ObjectId();
    const financeId = new mongoose.Types.ObjectId();
    const foreignOwnerId = new mongoose.Types.ObjectId();
    const otherStoreId = new mongoose.Types.ObjectId();
    const policyId = new mongoose.Types.ObjectId();
    const approvedAt = new Date('2026-01-01T00:00:00Z');
    await TestStore.collection.insertOne({ _id: storeId, name: 'Synthetic test Store' });
    await TestStore.collection.insertOne({ _id: otherStoreId, name: 'Other synthetic Store' });
    await TestUser.collection.insertMany([
      { _id: employeeId, store: storeId, role: 'staff', isDeleted: false },
      { _id: actorId, store: storeId, role: 'store_owner', isDeleted: false },
      { _id: reviewerId, store: storeId, role: 'store_owner', isDeleted: false },
      { _id: financeId, store: storeId, role: 'finance_staff', permissions: { 'leave.approve': true }, isDeleted: false },
      { _id: foreignOwnerId, store: otherStoreId, role: 'store_owner', isDeleted: false }
    ]);

    const policyDefinition = {
      _id: policyId, store: storeId, leaveTypeKey: 'vacation', version: 1, scopeType: 'store', scopeKey: 'all',
      classification: 'employer_provided', status: 'draft', effectiveFrom: approvedAt, effectiveThrough: new Date('2026-12-31T23:59:59Z'),
      eligibility: { employmentStatuses: ['active'] }, unitsPerDay: 480, paidTreatment: 'paid',
      accrual: { mode: 'none' }, carryover: { enabled: false }, sourceReferences: [{ title: 'Synthetic test policy basis', issuer: 'Isolated test', url: 'https://example.invalid/policy', effectiveDate: approvedAt }],
      createdBy: actorId
    };
    const draftPolicy = await Policy.create(policyDefinition);

    const indexes = await Policy.collection.indexes();
    assert.ok(indexes.some(index => index.unique && index.key.store && index.key.leaveTypeKey && index.key.version), 'policy identity unique index exists');
    await assert.rejects(Policy.create({ ...policyDefinition, _id: new mongoose.Types.ObjectId() }), error => error.code === 11000);

    assert.throws(() => ledger.buildApprovedPolicySnapshot(policyDefinition, { businessApprovedBy: actorId, complianceReviewedBy: actorId }), { code: 'independent_policy_approval_required' });
    const invalidEvidenceDefinition = { ...policyDefinition, _id: new mongoose.Types.ObjectId(), version: 3, status: 'active',
      approvalEvidence: { businessApprovedBy: actorId, complianceReviewedBy: actorId,
        complianceQualificationReference: 'synthetic compliance qualification fixture', approvedAt,
        effectiveApprovedAt: approvedAt, approvalReference: 'Invalid duplicate reviewer' } };
    invalidEvidenceDefinition.approvedSnapshot = ledger.policySnapshotPayload(invalidEvidenceDefinition);
    invalidEvidenceDefinition.checksum = ledger.calculatePolicyChecksum(invalidEvidenceDefinition.approvedSnapshot);
    const invalidEvidence = new Policy(invalidEvidenceDefinition);
    await assert.rejects(invalidEvidence.validate(), error => Boolean(error.errors.status || error.errors['approvalEvidence.complianceReviewedBy']));

    const models = { Store: TestStore, User: TestUser, LeaveRequest: TestLeaveRequest, LeavePolicyVersion: Policy, LeaveCreditLedgerEntry: Entry, LeavePolicyActivationGuard: Guard };
    const verifier = async reviewer => String(reviewer._id) === String(reviewerId)
      ? { verified: true, evidenceReference: 'synthetic compliance qualification fixture' } : { verified: false };
    await assert.rejects(Policy.updateOne({ _id: draftPolicy._id, status: 'draft' }, { $set: { status: 'active' } }, { runValidators: true }), /transaction-safe activation service/);
    const unauthorizedSave = await Policy.findById(draftPolicy._id);
    const unauthorizedEvidence = { businessApprovedBy: actorId, complianceReviewedBy: reviewerId,
      complianceQualificationReference: 'synthetic compliance qualification fixture', approvedAt,
      effectiveApprovedAt: approvedAt, approvalReference: 'ordinary-save-path' };
    const unauthorizedSnapshot = ledger.buildApprovedPolicySnapshot(unauthorizedSave, unauthorizedEvidence);
    unauthorizedSave.status = 'active';
    unauthorizedSave.approvalEvidence = unauthorizedEvidence;
    unauthorizedSave.approvedSnapshot = unauthorizedSnapshot.snapshot;
    unauthorizedSave.checksum = unauthorizedSnapshot.checksum;
    await assert.rejects(unauthorizedSave.save(), /transaction-safe activation service/);
    await assert.rejects(ledger.activateLeavePolicyVersion({ policyId: draftPolicy._id, actorId, complianceReviewerId: reviewerId,
      approvalReference: 'synthetic approval', effectiveDate: approvedAt, models }), { code: 'leave_policy_activation_input_invalid' });
    const policy = await ledger.activateLeavePolicyVersion({ policyId: draftPolicy._id, actorId, complianceReviewerId: reviewerId,
      approvalReference: 'synthetic approval', effectiveDate: approvedAt, verifyComplianceReviewer: verifier, models });
    assert.equal(policy.status, 'active', 'approved draft activates transactionally');
    assert.equal(policy.approvalEvidence.complianceQualificationReference, 'synthetic compliance qualification fixture');
    assert.equal(ledger.validatePolicyIntegrity(policy), true);
    const repeated = await ledger.activateLeavePolicyVersion({ policyId: draftPolicy._id, actorId, complianceReviewerId: reviewerId,
      approvalReference: 'synthetic approval', effectiveDate: approvedAt, verifyComplianceReviewer: verifier, models });
    assert.equal(String(repeated._id), String(policy._id), 'same approval retry is idempotent');
    assert.ok(await Guard.exists({ store: storeId, leaveTypeKey: 'vacation' }));
    assert.ok((await Guard.collection.indexes()).some(index => index.unique && index.name === 'one_policy_activation_guard_per_scope'));
    const overlappingCandidate = { ...policy.toObject(), _id: new mongoose.Types.ObjectId(), version: 10, status: 'active' };
    overlappingCandidate.approvedSnapshot = ledger.policySnapshotPayload(overlappingCandidate);
    overlappingCandidate.checksum = ledger.calculatePolicyChecksum(overlappingCandidate.approvedSnapshot);
    assert.throws(() => ledger.assertNoOverlappingActivePolicy(overlappingCandidate, [policy.toObject()]), { code: 'overlapping_active_leave_policy' });

    const nonOverlapping = await Policy.create({ ...policyDefinition, _id: new mongoose.Types.ObjectId(), version: 2,
      effectiveFrom: new Date('2027-01-01T00:00:00Z'), effectiveThrough: null });
    const futurePolicy = await ledger.activateLeavePolicyVersion({ policyId: nonOverlapping._id, actorId, complianceReviewerId: reviewerId,
      approvalReference: 'future synthetic approval', effectiveDate: nonOverlapping.effectiveFrom, verifyComplianceReviewer: verifier, models });
    assert.equal(futurePolicy.status, 'active', 'non-overlapping policy version activates');

    const conflictDraft = await Policy.create({ ...policyDefinition, _id: new mongoose.Types.ObjectId(), leaveTypeKey: 'vacation', version: 3 });
    const guardBeforeConflict = await Guard.findOne({ store: storeId, leaveTypeKey: 'vacation' }).lean();
    await assert.rejects(ledger.activateLeavePolicyVersion({ policyId: conflictDraft._id, actorId, complianceReviewerId: reviewerId,
      approvalReference: 'conflicting synthetic approval', effectiveDate: conflictDraft.effectiveFrom, verifyComplianceReviewer: verifier, models }), { code: 'overlapping_active_leave_policy' });
    assert.equal((await Policy.findById(conflictDraft._id)).status, 'draft', 'failed activation leaves candidate draft');
    assert.equal((await Policy.findById(policy._id).select('+checksum')).checksum, policy.checksum, 'conflict preserves existing approved policy');
    assert.equal((await Guard.findOne({ store: storeId, leaveTypeKey: 'vacation' })).revision, guardBeforeConflict.revision, 'failed transaction rolls back guard claim');

    const raceDrafts = await Policy.create([
      { ...policyDefinition, _id: new mongoose.Types.ObjectId(), leaveTypeKey: 'sick', version: 1 },
      { ...policyDefinition, _id: new mongoose.Types.ObjectId(), leaveTypeKey: 'sick', version: 2, scopeType: 'employee_category', scopeKey: 'part_time' }
    ]);
    let reviewersReady = 0;
    let releaseReviewers;
    const bothReviewersReady = new Promise(resolve => { releaseReviewers = resolve; });
    const synchronizedVerifier = async reviewer => {
      reviewersReady += 1;
      if (reviewersReady === 2) releaseReviewers();
      await bothReviewersReady;
      return verifier(reviewer);
    };
    const race = await Promise.allSettled(raceDrafts.map(draft => ledger.activateLeavePolicyVersion({ policyId: draft._id,
      actorId, complianceReviewerId: reviewerId, approvalReference: `race-${draft.version}`, effectiveDate: approvedAt,
      verifyComplianceReviewer: synchronizedVerifier, models })));
    assert.equal(race.filter(result => result.status === 'fulfilled').length, 1, 'exactly one of two concurrent overlapping activations commits');
    assert.equal(race.filter(result => result.status === 'rejected' && result.reason?.code === 'overlapping_active_leave_policy').length, 1,
      'the losing concurrent activation reports a deterministic overlap conflict');
    const sickActive = await Policy.find({ store: storeId, leaveTypeKey: 'sick', status: 'active' }).lean();
    assert.equal(sickActive.length, 1, 'only one overlapping policy scope is active after the race');

    const missingSourceDraft = await Policy.create({ ...policyDefinition, _id: new mongoose.Types.ObjectId(), version: 4, sourceReferences: [] });
    await assert.rejects(ledger.activateLeavePolicyVersion({ policyId: missingSourceDraft._id, actorId, complianceReviewerId: reviewerId,
      approvalReference: 'missing-source', effectiveDate: missingSourceDraft.effectiveFrom, verifyComplianceReviewer: verifier, models }), { code: 'leave_policy_sources_required' });
    const unverifiedReviewerDraft = await Policy.create({ ...policyDefinition, _id: new mongoose.Types.ObjectId(), version: 7 });
    await assert.rejects(ledger.activateLeavePolicyVersion({ policyId: unverifiedReviewerDraft._id, actorId, complianceReviewerId: reviewerId,
      approvalReference: 'missing-qualification', effectiveDate: unverifiedReviewerDraft.effectiveFrom, verifyComplianceReviewer: async () => ({ verified: false }), models }), { code: 'leave_policy_compliance_review_unverified' });

    const financeDraft = await Policy.create({ ...policyDefinition, _id: new mongoose.Types.ObjectId(), version: 8 });
    await assert.rejects(ledger.activateLeavePolicyVersion({ policyId: financeDraft._id, actorId: financeId, complianceReviewerId: reviewerId,
      approvalReference: 'finance-self-escalation', effectiveDate: financeDraft.effectiveFrom, verifyComplianceReviewer: verifier, models }), { code: 'leave_policy_activation_forbidden' });
    const crossStoreDraft = await Policy.create({ ...policyDefinition, _id: new mongoose.Types.ObjectId(), version: 9 });
    await assert.rejects(ledger.activateLeavePolicyVersion({ policyId: crossStoreDraft._id, actorId: foreignOwnerId, complianceReviewerId: reviewerId,
      approvalReference: 'cross-store', effectiveDate: crossStoreDraft.effectiveFrom, verifyComplianceReviewer: verifier, models }), { code: 'leave_policy_activation_forbidden' });

    const invalidScopeDraft = await Policy.create({ ...policyDefinition, _id: new mongoose.Types.ObjectId(), version: 5,
      scopeType: 'employee_category', scopeKey: '' });
    await assert.rejects(ledger.activateLeavePolicyVersion({ policyId: invalidScopeDraft._id, actorId, complianceReviewerId: reviewerId,
      approvalReference: 'invalid-scope', effectiveDate: invalidScopeDraft.effectiveFrom, verifyComplianceReviewer: verifier, models }), { code: 'invalid_leave_policy_scope' });

    const rollbackDraft = await Policy.create({ ...policyDefinition, _id: new mongoose.Types.ObjectId(), version: 6 });
    const rollbackApproval = { businessApprovedBy: actorId, complianceReviewedBy: reviewerId,
      complianceQualificationReference: 'synthetic compliance qualification fixture', approvedAt,
      effectiveApprovedAt: rollbackDraft.effectiveFrom, approvalReference: 'Rollback synthetic approval' };
    const rollbackSnapshot = ledger.buildApprovedPolicySnapshot(rollbackDraft, rollbackApproval);
    const session = await connection.startSession();
    try {
      await assert.rejects(session.withTransaction(async () => {
        await Policy.updateOne({ _id: rollbackDraft._id, status: 'draft' }, { $set: {
          status: 'active', approvalEvidence: rollbackApproval, approvedSnapshot: rollbackSnapshot.snapshot, checksum: rollbackSnapshot.checksum
        } }, { session, runValidators: true, [activationCapability.optionName]: activationCapability.token });
        throw new Error('synthetic activation rollback');
      }), /synthetic activation rollback/);
    } finally { await session.endSession(); }
    assert.equal((await Policy.findById(rollbackDraft._id)).status, 'draft', 'aborted activation leaves policy draft');

    await assert.rejects(Policy.updateOne({ _id: policy._id }, { $set: { paidTreatment: 'unpaid' } }), /immutable/);
    await assert.rejects(Policy.bulkWrite([{ updateOne: { filter: { _id: policy._id }, update: { $set: { paidTreatment: 'unpaid' } } } }]), /bulk writes/);
    await assert.rejects(Policy.deleteOne({ _id: policy._id }), /cannot be deleted/);
    assert.equal((await Policy.findById(policy._id)).paidTreatment, 'paid', 'approved policy snapshot remains unchanged');

    const ledgerIndexes = await Entry.collection.indexes();
    for (const requiredIndex of ['one_accrual_per_source', 'one_reservation_per_request', 'one_consumption_per_request', 'one_manual_adjustment_per_reference', 'one_reversal_per_entry']) {
      assert.ok(ledgerIndexes.some(index => index.name === requiredIndex && index.unique), `${requiredIndex} unique index exists`);
    }
    const periodA = new mongoose.Types.ObjectId();
    const periodB = new mongoose.Types.ObjectId();
    const makeEntry = (overrides = {}) => ({
      store: storeId, employee: employeeId, leaveTypeKey: 'vacation', policyVersion: policy._id,
      entryType: 'accrual', units: 60, effectiveDate: new Date('2026-02-01T00:00:00Z'),
      sourceType: 'accrual_period', sourceReference: periodA,
      idempotencyKey: `ledger-${crypto.randomBytes(7).toString('hex')}`, actor: actorId,
      reason: 'Synthetic isolated fixture', unitsPerDaySnapshot: 480, ...overrides
    });
    const idem = makeEntry({ idempotencyKey: 'same-key-test-0001', sourceReference: periodA });
    const outcomes = await Promise.allSettled([Entry.create(idem), Entry.create({ ...idem, sourceReference: periodB })]);
    assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1, 'one concurrent idempotent create wins');
    assert.equal(outcomes.filter(result => result.status === 'rejected' && result.reason?.code === 11000).length, 1, 'duplicate idempotency is rejected by MongoDB');
    const sourceA = new mongoose.Types.ObjectId();
    await Entry.create(makeEntry({ idempotencyKey: 'source-unique-first', sourceReference: sourceA }));
    await assert.rejects(Entry.create(makeEntry({ idempotencyKey: 'source-unique-second', sourceReference: sourceA })), error => error.code === 11000);

    const invalid = new Entry(makeEntry({ units: 0.5, idempotencyKey: 'invalid-entry-test' }));
    await assert.rejects(invalid.validate(), error => Boolean(error.errors.units));
    const appendOnlyEntry = await Entry.create(makeEntry({ entryType: 'opening_balance', sourceType: 'opening_balance', sourceReference: new mongoose.Types.ObjectId(), idempotencyKey: 'append-only-test' }));
    await assert.rejects(Entry.updateOne({ _id: appendOnlyEntry._id }, { $set: { units: 999 } }), /append-only/);
    await assert.rejects(Entry.bulkWrite([{ updateOne: { filter: { _id: appendOnlyEntry._id }, update: { $set: { units: 999 } } } }]), /bulk updates/);
    await assert.rejects(appendOnlyEntry.deleteOne(), /append-only/);
    assert.equal((await Entry.findById(appendOnlyEntry._id)).units, 60);
    const reversal = { ...makeEntry({ entryType: 'reversal', sourceType: 'ledger_entry', sourceReference: appendOnlyEntry._id,
      reversalOf: appendOnlyEntry._id, authorizedBy: reviewerId, idempotencyKey: 'reversal-once' }) };
    await Entry.create(reversal);
    await assert.rejects(Entry.create({ ...reversal, idempotencyKey: 'reversal-twice' }), error => error.code === 11000);

    const validReferences = await ledger.validateLedgerReferences({ entry: makeEntry({ sourceReference: periodA }), models });
    assert.equal(String(validReferences.employee._id), String(employeeId));
    await assert.rejects(ledger.validateLedgerReferences({ entry: makeEntry({ store: new mongoose.Types.ObjectId() }), models }), { code: 'ledger_store_missing' });
    await assert.rejects(ledger.validateLedgerReferences({ entry: makeEntry({ employee: new mongoose.Types.ObjectId() }), models }), { code: 'ledger_employee_store_mismatch' });
    await assert.rejects(ledger.validateLedgerReferences({ entry: makeEntry({ policyVersion: new mongoose.Types.ObjectId() }), models }), { code: 'ledger_policy_not_approved' });
    await assert.rejects(ledger.validateLedgerReferences({ entry: makeEntry({ entryType: 'reservation', sourceType: 'leave_request', sourceReference: new mongoose.Types.ObjectId() }), models }), { code: 'ledger_leave_request_scope_mismatch' });

    const requestId = new mongoose.Types.ObjectId();
    await TestLeaveRequest.collection.insertOne({ _id: requestId, store: storeId, employee: employeeId, isPaid: true });
    const opening = await Entry.create(makeEntry({ entryType: 'opening_balance', units: 1000, sourceType: 'opening_balance', sourceReference: new mongoose.Types.ObjectId(), idempotencyKey: 'projection-opening' }));
    const reservation = await Entry.create(makeEntry({ entryType: 'reservation', units: 400, sourceType: 'leave_request', sourceReference: requestId, idempotencyKey: 'projection-reservation' }));
    const consumption = await Entry.create(makeEntry({ entryType: 'consumption', units: 250, sourceType: 'leave_request', sourceReference: requestId, idempotencyKey: 'projection-consumption' }));
    const release = await Entry.create(makeEntry({ entryType: 'reservation_release', units: 150, sourceType: 'leave_request', sourceReference: requestId, idempotencyKey: 'projection-release' }));
    for (const item of [opening, reservation, consumption, release]) {
      const references = await ledger.validateLedgerReferences({ entry: item.toObject(), models });
      assert.equal(String(references.policy._id), String(policy._id));
    }
    const entries = await Entry.find({ _id: { $in: [opening._id, reservation._id, consumption._id, release._id] } }).lean();
    const projection = ledger.reconcileLeaveCredits({ entries, policies: [policy.toObject()], leaveRequests: [{ _id: requestId }], storeId, employeeId, leaveTypeKey: 'vacation' });
    assert.equal(projection.availableUnits, 750);
    assert.equal(projection.isReconciled, true);
  } finally {
    for (const name of Object.values(collectionNames)) {
      try { await connection.dropCollection(name); } catch (error) { if (error.codeName !== 'NamespaceNotFound') throw error; }
    }
    await connection.close();
  }
});
