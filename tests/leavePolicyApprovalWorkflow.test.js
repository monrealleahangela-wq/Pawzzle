const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');
const Decision = require('../models/LeavePolicyDecision');
const Qualification = require('../models/LeavePolicyReviewerQualification');
const Policy = require('../models/LeavePolicyVersion');
const workflow = require('../services/leavePolicyApprovalWorkflowService');
const { policySnapshotPayload, calculatePolicyChecksum } = require('../services/leaveCreditLedgerService');

const storeId = new mongoose.Types.ObjectId();
const reviewerId = new mongoose.Types.ObjectId();
const ownerId = new mongoose.Types.ObjectId();
const qualificationId = new mongoose.Types.ObjectId();
const date = new Date('2026-01-01T00:00:00.000Z');
const policy = {
  _id: new mongoose.Types.ObjectId(), store: storeId, leaveTypeKey: 'vacation', version: 1, scopeType: 'store', scopeKey: 'all',
  classification: 'employer_provided', status: 'draft', reviewState: 'owner_approved', contentRevision: 1,
  effectiveFrom: date, effectiveThrough: new Date('2026-12-31T23:59:59.999Z'),
  eligibility: { employmentStatuses: ['active'], employeeCategories: [], minimumServiceDays: null }, unitsPerDay: 480,
  paidTreatment: 'paid', accrual: { mode: 'none' }, carryover: { enabled: false },
  sourceReferences: [{ title: 'Synthetic test basis', issuer: 'Test only', url: 'https://example.invalid/policy', effectiveDate: date }]
};

test('policy readiness is fail-closed until current, independently reviewed evidence and all LP decisions exist', async () => {
  const checksum = calculatePolicyChecksum(policySnapshotPayload(policy));
  const mk = (stage, decision, actor, decisionId) => ({
    _id: new mongoose.Types.ObjectId(), store: storeId, policy: policy._id, policyVersion: 1, contentRevision: 1,
    policyChecksum: checksum, stage, decision, decisionId, actor, reviewerQualification: stage === 'compliance_review' || stage === 'policy_decision' ? qualificationId : null,
    reason: 'Synthetic evidence only', createdAt: new Date('2026-01-02T00:00:00Z')
  });
  const events = [mk('submission', 'submitted', ownerId), mk('compliance_review', 'approved', reviewerId), mk('owner_approval', 'approved', ownerId)];
  for (const decisionId of workflow.DECISION_IDS) events.push(mk('policy_decision', 'approved', reviewerId, decisionId));
  const qualification = {
    _id: qualificationId, store: storeId, reviewer: reviewerId, status: 'verified', validFrom: date,
    validThrough: new Date('2027-01-01T00:00:00Z'), qualificationCategory: 'leave_policy_compliance',
    authorityScopes: { leaveTypeKeys: ['vacation'], policyClassifications: ['employer_provided'], decisionIds: ['all'] }
  };
  const users = [
    { _id: reviewerId, store: storeId, role: 'staff', isActive: true },
    { _id: ownerId, store: storeId, role: 'store_owner', isActive: true }
  ];
  const complete = await workflow.evaluatePolicyReadiness({ policy, events, qualifications: [qualification], users, now: new Date('2026-02-01T00:00:00Z') });
  assert.equal(complete.state, 'ready_for_activation_review');
  assert.deepEqual(complete.blockers, []);

  const missingOne = await workflow.evaluatePolicyReadiness({ policy, events: events.slice(0, -1), qualifications: [qualification], users, now: new Date('2026-02-01T00:00:00Z') });
  assert.equal(missingOne.state, 'not_ready');
  assert.ok(missingOne.blockers.some(blocker => blocker.startsWith('LP-22')));

  const revoked = await workflow.evaluatePolicyReadiness({ policy, events, qualifications: [{ ...qualification, status: 'revoked' }], users, now: new Date('2026-02-01T00:00:00Z') });
  assert.equal(revoked.state, 'not_ready');
  assert.ok(revoked.blockers.some(blocker => blocker.includes('qualification')));

  const editedPolicy = { ...policy, unitsPerDay: 420 };
  const stale = await workflow.evaluatePolicyReadiness({ policy: editedPolicy, events, qualifications: [qualification], users, now: new Date('2026-02-01T00:00:00Z') });
  assert.equal(stale.state, 'not_ready');
  assert.ok(stale.blockers.some(blocker => blocker.includes('submitted')));
});

test('policy decisions and qualifications cannot be forged through ordinary direct insertion', async () => {
  const decision = new Decision({
    store: storeId, policy: policy._id, policyVersion: 1, contentRevision: 1,
    policyChecksum: 'a'.repeat(64), stage: 'owner_approval', decision: 'approved', actor: ownerId,
    reason: 'forged', idempotencyKey: 'forged-decision'
  });
  await assert.rejects(decision.validate(), /audited workflow service/);
  const qualification = new Qualification({
    store: storeId, reviewer: reviewerId, qualificationCategory: 'leave_policy_compliance',
    credentialIssuer: 'Test', credentialType: 'Test', protectedEvidenceReference: 'opaque:test',
    validFrom: date, validThrough: new Date('2027-01-01'), status: 'verified', verifiedBy: ownerId,
    verifiedAt: date, createdBy: ownerId
  });
  await assert.rejects(qualification.validate(), /registered pending/);
  await assert.rejects(Policy.bulkWrite([{ insertOne: { document: { status: 'draft', reviewState: 'owner_approved' } } }]), /Policy bulk writes may only create drafts/);
  await assert.rejects(Qualification.bulkWrite([{ insertOne: { document: { status: 'verified', verifiedBy: ownerId } } }]), /only register pending reviewer qualifications/);
});

test('policy workflow authority rejects Finance and Manager even with custom permission', () => {
  assert.throws(() => workflow.assertStoreAdmin({ _id: ownerId, role: 'finance_staff', permissions: { 'leave.approve': true } }), { code: 'leave_policy_workflow_forbidden' });
  assert.throws(() => workflow.assertStoreAdmin({ _id: ownerId, role: 'manager', permissions: { 'leave.approve': true } }), { code: 'leave_policy_workflow_forbidden' });
  assert.doesNotThrow(() => workflow.assertStoreAdmin({ _id: ownerId, role: 'store_owner' }));
});
