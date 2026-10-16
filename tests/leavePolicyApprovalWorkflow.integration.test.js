const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const test = require('node:test');
const PolicySchema = require('../models/LeavePolicyVersion').schema;
const DecisionSchema = require('../models/LeavePolicyDecision').schema;
const QualificationSchema = require('../models/LeavePolicyReviewerQualification').schema;
const QualificationEventSchema = require('../models/LeavePolicyReviewerQualificationEvent').schema;
const ActivityLogSchema = require('../models/ActivityLog').schema;
const workflow = require('../services/leavePolicyApprovalWorkflowService');

const uri = process.env.MONGODB_TRANSACTION_TEST_URI;
const testSchema = new mongoose.Schema({}, { strict: false, versionKey: false });

test('isolated MongoDB leave policy workflow transactions, approval separation, and rollback', {
  skip: !uri ? 'MONGODB_TRANSACTION_TEST_URI is not configured; policy workflow transaction verification skipped.' : false
}, async () => {
  let parsed;
  try { parsed = new URL(uri); } catch (_error) { throw new Error('Configured transaction test URI is malformed; refusing database access.'); }
  const databaseName = parsed.pathname.replace(/^\//, '').split('/')[0];
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || parsed.port !== '27018' || parsed.username || parsed.password
    || parsed.searchParams.get('replicaSet') !== 'pawzzleTestRS' || !databaseName || !/(^|[_-])test($|[_-])/i.test(databaseName)
    || /(^|[_-])(prod|stag|staging)($|[_-])/i.test(databaseName)) {
    throw new Error('Policy workflow tests require an unauthenticated loopback pawzzleTestRS and explicitly test-named database; refusing writes.');
  }
  const connection = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 5000 }).asPromise();
  const suffix = crypto.randomBytes(8).toString('hex');
  const collections = Object.fromEntries(['policy', 'decision', 'qualification', 'qualification_event', 'activity', 'store', 'user']
    .map(name => [name, `b4c_policy_${name}_${suffix}`]));
  try {
    const hello = await connection.db.admin().command({ hello: 1 });
    if (hello.setName !== 'pawzzleTestRS' || hello.isWritablePrimary !== true || hello.me !== '127.0.0.1:27018'
      || !Array.isArray(hello.hosts) || hello.hosts.length !== 1 || hello.hosts[0] !== '127.0.0.1:27018') {
      throw new Error('Configured MongoDB is not the isolated writable pawzzleTestRS primary; refusing writes.');
    }
    const name = key => `Batch4c_${key}_${suffix}`;
    const Policy = connection.model(name('Policy'), PolicySchema, collections.policy);
    const Decision = connection.model(name('Decision'), DecisionSchema, collections.decision);
    const Qualification = connection.model(name('Qualification'), QualificationSchema, collections.qualification);
    const QualificationEvent = connection.model(name('QualificationEvent'), QualificationEventSchema, collections.qualification_event);
    const ActivityLog = connection.model(name('ActivityLog'), ActivityLogSchema, collections.activity);
    const Store = connection.model(name('Store'), testSchema, collections.store);
    const User = connection.model(name('User'), testSchema, collections.user);
    const models = { Policy, Decision, Qualification, QualificationEvent, ActivityLog, Store, User };
    await Promise.all(Object.values(models).map(model => model.createIndexes()));

    const storeId = new mongoose.Types.ObjectId();
    const ownerId = new mongoose.Types.ObjectId();
    const verifierId = new mongoose.Types.ObjectId();
    const reviewerId = new mongoose.Types.ObjectId();
    const financeId = new mongoose.Types.ObjectId();
    const otherStoreId = new mongoose.Types.ObjectId();
    const foreignOwnerId = new mongoose.Types.ObjectId();
    await Store.collection.insertMany([{ _id: storeId }, { _id: otherStoreId }]);
    await User.collection.insertMany([
      { _id: ownerId, store: storeId, role: 'store_owner', isDeleted: false },
      { _id: verifierId, store: storeId, role: 'admin', isDeleted: false },
      { _id: reviewerId, store: storeId, role: 'staff', staffType: 'hr', isDeleted: false },
      { _id: financeId, store: storeId, role: 'finance_staff', permissions: { 'leave.approve': true }, isDeleted: false },
      { _id: foreignOwnerId, store: otherStoreId, role: 'store_owner', isDeleted: false }
    ]);

    const now = new Date();
    const effectiveFrom = new Date(now.getTime() + 86400000);
    const policy = await Policy.create({
      store: storeId, leaveTypeKey: 'vacation', version: 1, scopeType: 'store', scopeKey: 'all',
      classification: 'employer_provided', status: 'draft', reviewState: 'draft', contentRevision: 1, workflowRevision: 0,
      effectiveFrom, effectiveThrough: new Date(effectiveFrom.getTime() + 365 * 86400000),
      eligibility: { employmentStatuses: ['active'] }, unitsPerDay: 480, paidTreatment: 'paid',
      accrual: { mode: 'none' }, carryover: { enabled: false },
      sourceReferences: [{ title: 'Synthetic only', issuer: 'Test', url: 'https://example.invalid/policy' }], createdBy: ownerId
    });
    const createdDraft = await workflow.createDraftPolicy({ storeId, actorId: ownerId, reason: 'Create synthetic draft', idempotencyKey: 'create-sick-draft', models,
      policy: { leaveTypeKey: 'sick', version: 1, scopeType: 'store', scopeKey: 'all', classification: 'employer_provided',
        effectiveFrom, effectiveThrough: new Date(effectiveFrom.getTime() + 365 * 86400000), eligibility: { employmentStatuses: ['active'] },
        unitsPerDay: 480, paidTreatment: 'paid', accrual: { mode: 'none' }, carryover: { enabled: false },
        sourceReferences: [{ title: 'Synthetic only', issuer: 'Test', url: 'https://example.invalid/policy' }] }
    });
    assert.equal(createdDraft.policy.status, 'draft');
    assert.equal((await workflow.createDraftPolicy({ storeId, actorId: ownerId, reason: 'Create synthetic draft', idempotencyKey: 'create-sick-draft', models,
      policy: { leaveTypeKey: 'sick', version: 1, scopeType: 'store', scopeKey: 'all', classification: 'employer_provided',
        effectiveFrom, effectiveThrough: new Date(effectiveFrom.getTime() + 365 * 86400000), eligibility: { employmentStatuses: ['active'] },
        unitsPerDay: 480, paidTreatment: 'paid', accrual: { mode: 'none' }, carryover: { enabled: false },
        sourceReferences: [{ title: 'Synthetic only', issuer: 'Test', url: 'https://example.invalid/policy' }] }
    })).replayed, true, 'same Store-scoped create key is idempotent');
    const revised = await workflow.reviseDraftPolicy({ policyId: createdDraft.policy._id, storeId, actorId: ownerId,
      patch: { unitsPerDay: 450 }, reason: 'Synthetic revision', idempotencyKey: 'revise-sick-draft', models });
    assert.equal(revised.policy.contentRevision, 2);
    assert.equal(revised.policy.reviewState, 'draft');
    assert.equal((await workflow.reviseDraftPolicy({ policyId: createdDraft.policy._id, storeId, actorId: ownerId,
      patch: { unitsPerDay: 450 }, reason: 'Synthetic revision', idempotencyKey: 'revise-sick-draft', models })).replayed, true);
    await assert.rejects(Policy.updateOne({ _id: createdDraft.policy._id }, { $set: { unitsPerDay: 400 } }), /audited leave policy workflow service/);
    const qualification = await workflow.registerReviewerQualification({
      storeId, actorId: ownerId, reviewerId, qualificationCategory: 'leave_policy_compliance',
      authorityScopes: { leaveTypeKeys: ['vacation'], policyClassifications: ['employer_provided'], decisionIds: ['all'] },
      credentialIssuer: 'Synthetic test issuer', credentialType: 'Synthetic credential', protectedEvidenceReference: 'opaque-test-reference',
      validFrom: new Date(now.getTime() - 86400000), validThrough: new Date(now.getTime() + 730 * 86400000),
      reason: 'Synthetic isolated fixture registration', idempotencyKey: 'register-reviewer-1', models
    });
    assert.equal(qualification.status, 'pending');
    await assert.rejects(workflow.verifyReviewerQualification({ qualificationId: qualification._id, verifierId: reviewerId,
      verificationEvidenceReference: 'opaque-verification-ref', reason: 'Self-verification is denied', idempotencyKey: 'verify-reviewer-self',
      verifyCredential: async () => ({ verified: true, evidenceReference: 'opaque-verification-ref' }), models }), error => ['leave_policy_workflow_forbidden', 'leave_policy_qualification_verification_denied'].includes(error.code));
    const unsubstantiated = await workflow.verifyReviewerQualification({ qualificationId: qualification._id, verifierId,
      verificationEvidenceReference: 'caller-supplied-fake-reference', reason: 'Trusted verifier returned no evidence', idempotencyKey: 'verify-reviewer-unsubstantiated',
      verifyCredential: async () => ({ verified: true }), models });
    assert.equal(unsubstantiated.verified, false, 'caller-supplied evidence cannot replace a verifier-produced evidence reference');
    assert.equal((await Qualification.findById(qualification._id)).status, 'pending');

    const verified = await workflow.verifyReviewerQualification({ qualificationId: qualification._id, verifierId,
      verificationEvidenceReference: 'opaque-verification-ref', reason: 'Synthetic accepted credential check', idempotencyKey: 'verify-reviewer-2',
      verifyCredential: async () => ({ verified: true, evidenceReference: 'opaque-verification-ref' }), models });
    assert.equal(verified.status, 'verified');

    const submitted = await workflow.submitPolicyForReview({ policyId: policy._id, storeId, actorId: ownerId, reason: 'Submit synthetic draft', idempotencyKey: 'submit-1', models });
    assert.equal(submitted.policy.reviewState, 'submitted_for_review');
    const replay = await workflow.submitPolicyForReview({ policyId: policy._id, storeId, actorId: ownerId, reason: 'Submit synthetic draft', idempotencyKey: 'submit-1', models });
    assert.equal(replay.replayed, true);
    await workflow.recordComplianceReview({ policyId: policy._id, storeId, reviewerId, reviewerQualificationId: qualification._id,
      decision: 'approved', reason: 'Synthetic review only', evidenceReference: 'opaque-verification-ref', idempotencyKey: 'review-1', models });
    for (const decisionId of workflow.DECISION_IDS) {
      await workflow.recordPolicyDecision({ policyId: policy._id, storeId, reviewerId, reviewerQualificationId: qualification._id,
        decisionId, decision: 'not_applicable', reason: 'Pending real sign-off; synthetic fixture disposition only',
        evidenceReference: 'opaque-verification-ref', idempotencyKey: `decision-${decisionId}`, models });
    }
    let approvalReads = 0;
    let releaseApprovalReads;
    const bothApprovalsReadSameRevision = new Promise(resolve => { releaseApprovalReads = resolve; });
    const gatedPolicy = new Proxy(Policy, {
      get(target, property) {
        if (property === 'findOne') return (filter, ...args) => {
          const query = target.findOne(filter, ...args);
          if (String(filter?._id || '') !== String(policy._id)) return query;
          const execute = query.exec.bind(query);
          query.exec = async (...execArgs) => {
            const result = await execute(...execArgs);
            approvalReads += 1;
            if (approvalReads === 2) releaseApprovalReads();
            await bothApprovalsReadSameRevision;
            return result;
          };
          return query;
        };
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
    const raceModels = { ...models, Policy: gatedPolicy };
    const approvals = await Promise.allSettled([
      workflow.approvePolicyAsOwner({ policyId: policy._id, storeId, actorId: ownerId, reason: 'Synthetic Owner/Admin approval', effectiveDate: effectiveFrom, idempotencyKey: 'owner-approval-a', models: raceModels }),
      workflow.approvePolicyAsOwner({ policyId: policy._id, storeId, actorId: ownerId, reason: 'Synthetic Owner/Admin approval', effectiveDate: effectiveFrom, idempotencyKey: 'owner-approval-b', models: raceModels })
    ]);
    assert.equal(approvals.filter(result => result.status === 'fulfilled').length, 1, 'only one competing owner approval transition commits');
    assert.equal((await Policy.findById(policy._id)).status, 'draft', 'approval workflow never activates a policy');
    const readiness = await workflow.getPolicyReadiness({ policyId: policy._id, storeId, models });
    assert.equal(readiness.state, 'ready_for_activation_review', 'readiness is a derived check only, not activation');

    const financeDraft = await Policy.create({ ...policy.toObject(), _id: new mongoose.Types.ObjectId(), version: 2, reviewState: 'draft', contentRevision: 1, workflowRevision: 0, createdBy: ownerId });
    await assert.rejects(workflow.submitPolicyForReview({ policyId: financeDraft._id, storeId, actorId: financeId, reason: 'No', idempotencyKey: 'finance-submit', models }), { code: 'leave_policy_workflow_forbidden' });
    await assert.rejects(workflow.submitPolicyForReview({ policyId: financeDraft._id, storeId, actorId: foreignOwnerId, reason: 'No', idempotencyKey: 'foreign-submit', models }), { code: 'leave_policy_workflow_forbidden' });

    const rollbackDraft = await Policy.create({ ...policy.toObject(), _id: new mongoose.Types.ObjectId(), version: 3, reviewState: 'draft', contentRevision: 1, workflowRevision: 0, createdBy: ownerId });
    const failingModels = { ...models, ActivityLog: { create: async () => { throw new Error('synthetic audit persistence failure'); } } };
    await assert.rejects(workflow.submitPolicyForReview({ policyId: rollbackDraft._id, storeId, actorId: ownerId, reason: 'Rollback test', idempotencyKey: 'rollback-submit', models: failingModels }), /synthetic audit persistence failure/);
    assert.equal((await Policy.findById(rollbackDraft._id)).reviewState, 'draft', 'policy transition rolls back with audit failure');
    assert.equal(await Decision.countDocuments({ policy: rollbackDraft._id }), 0, 'append-only decision event rolls back with policy state');

    await workflow.revokeReviewerQualification({ qualificationId: qualification._id, actorId: ownerId, reason: 'Synthetic revocation test', idempotencyKey: 'revoke-reviewer-1', models });
    const noLongerReady = await workflow.getPolicyReadiness({ policyId: policy._id, storeId, models });
    assert.equal(noLongerReady.state, 'not_ready', 'revoked reviewer qualification invalidates readiness');

    const decisionIndexes = await Decision.collection.indexes();
    assert.ok(decisionIndexes.some(index => index.name === 'policy_decision_idempotency' && index.unique));
    const qualificationIndexes = await QualificationEvent.collection.indexes();
    assert.ok(qualificationIndexes.some(index => index.name === 'qualification_store_idempotency' && index.unique));
  } finally {
    for (const collection of Object.values(collections)) await connection.db.dropCollection(collection).catch(() => {});
    await connection.close();
  }
});
