const DefaultStore = require('../models/Store');
const DefaultUser = require('../models/User');
const DefaultPolicy = require('../models/LeavePolicyVersion');
const DefaultDecision = require('../models/LeavePolicyDecision');
const DefaultQualification = require('../models/LeavePolicyReviewerQualification');
const DefaultQualificationEvent = require('../models/LeavePolicyReviewerQualificationEvent');
const DefaultActivityLog = require('../models/ActivityLog');
const workflowCapability = require('../utils/leavePolicyWorkflowCapability');
const { normalizeRole, isStoreAdmin, hasPermission } = require('../config/permissions');
const { policySnapshotPayload, calculatePolicyChecksum } = require('./leaveCreditLedgerService');

const DECISION_IDS = Array.from({ length: 22 }, (_, index) => `LP-${String(index + 1).padStart(2, '0')}`);
const err = (code, message) => Object.assign(new Error(message), { code });
const idOf = value => String(value?._id || value || '');
const isFinance = user => normalizeRole(user) === 'finance_staff';
const decisionChecksum = policy => calculatePolicyChecksum(policySnapshotPayload(policy));

const defaultModels = () => ({
  Store: DefaultStore, User: DefaultUser, Policy: DefaultPolicy, Decision: DefaultDecision,
  Qualification: DefaultQualification, QualificationEvent: DefaultQualificationEvent, ActivityLog: DefaultActivityLog
});

const assertStoreAdmin = (actor, permission = 'leave.approve') => {
  if (!actor || isFinance(actor) || !isStoreAdmin(actor) || !hasPermission(actor, permission)) {
    throw err('leave_policy_workflow_forbidden', 'This policy workflow action requires an authorized Store Owner/Admin; Finance and custom permission escalation are not sufficient.');
  }
};

const loadActor = async (models, actorId, storeId, session, permission = 'leave.approve') => {
  const actor = await models.User.findOne({ _id: actorId, store: storeId, isDeleted: { $ne: true }, isActive: { $ne: false } }).session(session).lean();
  assertStoreAdmin(actor, permission);
  if (!(await models.Store.exists({ _id: storeId }).session(session))) throw err('leave_policy_store_missing', 'The policy Store does not exist.');
  return actor;
};

const withTransaction = async (Policy, operation) => {
  const connection = Policy.db;
  if (!connection || typeof connection.startSession !== 'function') {
    throw err('leave_policy_transactions_required', 'Leave policy approval transitions require transaction-capable MongoDB.');
  }
  const session = await connection.startSession();
  try {
    let result;
    await session.withTransaction(async () => { result = await operation(session); });
    return result;
  } finally { await session.endSession(); }
};

const appendAudit = async (models, { actor, storeId, action, details }, session) => {
  if (!models.ActivityLog) return;
  await models.ActivityLog.create([{
    user: actor._id, store: storeId, category: 'leave', action,
    details: String(details).slice(0, 1000)
  }], { session });
};

const readPolicy = async (models, policyId, storeId, session) => {
  const policy = await models.Policy.findOne({ _id: policyId, store: storeId }).session(session).select('+checksum +approvedSnapshot');
  if (!policy || policy.status !== 'draft') throw err('leave_policy_draft_unavailable', 'The Store-scoped draft policy was not found or is no longer editable.');
  return policy;
};

const assertPolicy = policy => {
  const date = new Date(policy.effectiveFrom);
  if (!/^[a-z0-9][a-z0-9_-]{0,59}$/.test(String(policy.leaveTypeKey || ''))
    || !Number.isFinite(date.getTime())
    || (policy.effectiveThrough && new Date(policy.effectiveThrough) < date)
    || !['store', 'employee_category'].includes(policy.scopeType)
    || (policy.scopeType === 'store' && policy.scopeKey !== 'all')
    || (policy.scopeType === 'employee_category' && !String(policy.scopeKey || '').trim())) {
    throw err('leave_policy_scope_invalid', 'Leave type, Store/category scope, or effective-date range is incomplete or invalid.');
  }
  if (!Array.isArray(policy.sourceReferences) || !policy.sourceReferences.length || policy.sourceReferences.some(source => !source.title || !source.issuer || !/^https:\/\//i.test(source.url || ''))) {
    throw err('leave_policy_sources_invalid', 'At least one source reference with a title, issuer, and HTTPS URL is required.');
  }
};

const ensureIdempotency = async (models, { policyId, storeId, key, actorId, stage, decision, checksum, contentRevision }, session) => {
  if (!String(key || '').trim()) throw err('leave_policy_idempotency_required', 'An idempotency key is required for every policy workflow action.');
  const prior = await models.Decision.findOne({ store: storeId, policy: policyId, idempotencyKey: key }).session(session).lean();
  if (!prior) return null;
  const same = idOf(prior.actor) === idOf(actorId) && prior.stage === stage && prior.decision === decision
    && prior.policyChecksum === checksum && prior.contentRevision === contentRevision;
  if (!same) throw err('leave_policy_idempotency_conflict', 'This idempotency key was already used for a different action or policy revision.');
  return prior;
};

const findRetry = async (models, policy, { key, actorId, stage, decision }, session) => {
  if (!String(key || '').trim()) throw err('leave_policy_idempotency_required', 'An idempotency key is required for every policy workflow action.');
  const prior = await models.Decision.findOne({ store: policy.store, policy: policy._id, idempotencyKey: key }).session(session).lean();
  if (!prior) return null;
  if (idOf(prior.actor) !== idOf(actorId) || prior.stage !== stage || prior.decision !== decision
    || prior.policyChecksum !== decisionChecksum(policy) || prior.contentRevision !== Number(policy.contentRevision || 1)) {
    throw err('leave_policy_idempotency_conflict', 'This idempotency key was already used for a different action or policy revision.');
  }
  return prior;
};

const appendDecision = async (models, policy, data, session) => {
  const checksum = decisionChecksum(policy);
  const contentRevision = policy.contentRevision || 1;
  const duplicate = await ensureIdempotency(models, {
    policyId: policy._id, storeId: policy.store, key: data.idempotencyKey,
    actorId: data.actorId, stage: data.stage, decision: data.decision, checksum, contentRevision
  }, session);
  if (duplicate) return { event: duplicate, replayed: true, checksum, contentRevision };
  const event = new models.Decision({
    store: policy.store, policy: policy._id, policyVersion: policy.version, contentRevision,
    policyChecksum: checksum, stage: data.stage, decision: data.decision,
    decisionId: data.decisionId || null, actor: data.actorId,
    reviewerQualification: data.reviewerQualification || null,
    evidenceReference: data.evidenceReference || undefined,
    effectiveDate: policy.effectiveFrom,
    reason: String(data.reason || '').trim(), idempotencyKey: String(data.idempotencyKey).trim(),
    supersedes: data.supersedes || null, invalidates: data.invalidates || null
  });
  event.$locals[workflowCapability.localKey] = true;
  await event.save({ session });
  return { event, replayed: false, checksum, contentRevision };
};

const appendQualificationEvent = async (models, data, session) => {
  const event = new models.QualificationEvent(data);
  event.$locals[workflowCapability.localKey] = true;
  await event.save({ session });
  return event;
};

const claimWorkflowRevision = async (models, policy, session, updates = {}) => {
  const expected = Number(policy.workflowRevision || 0);
  const result = await models.Policy.updateOne({
    _id: policy._id, store: policy.store, status: 'draft', workflowRevision: expected
  }, { $set: { ...updates, updatedAt: new Date() }, $inc: { workflowRevision: 1 } }, {
    session, runValidators: true,
    [workflowCapability.optionName]: workflowCapability.token
  });
  if (result.modifiedCount !== 1) throw err('leave_policy_workflow_conflict', 'The policy changed concurrently; reload its latest revision before retrying.');
};

const registerReviewerQualification = async ({ storeId, actorId, reviewerId, qualificationCategory, authorityScopes, credentialIssuer, credentialType, protectedEvidenceReference, validFrom, validThrough, reason, idempotencyKey, models: injected } = {}) => {
  const models = { ...defaultModels(), ...injected };
  return withTransaction(models.Policy, async session => {
    const actor = await loadActor(models, actorId, storeId, session, 'leave.approve');
    if (idOf(actorId) === idOf(reviewerId) || !String(reason || '').trim() || !String(protectedEvidenceReference || '').trim()) {
      throw err('leave_policy_qualification_input_invalid', 'A distinct reviewer, protected evidence reference, and audit reason are required.');
    }
    const from = new Date(validFrom); const through = new Date(validThrough);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(through.getTime()) || through < from) throw err('leave_policy_qualification_dates_invalid', 'Qualification validity dates are invalid.');
    const reviewer = await models.User.findOne({ _id: reviewerId, store: storeId, isDeleted: { $ne: true }, isActive: { $ne: false } }).session(session).lean();
    if (!reviewer || isFinance(reviewer)) throw err('leave_policy_reviewer_invalid', 'Reviewer must be an existing non-Finance user in this Store.');
    const prior = await models.QualificationEvent.findOne({ store: storeId, idempotencyKey }).session(session).lean();
    if (prior) {
      if (idOf(prior.actor) === idOf(actorId) && prior.eventType === 'registered') return models.Qualification.findById(prior.qualification).session(session);
      throw err('leave_policy_idempotency_conflict', 'Qualification registration idempotency key has already been used.');
    }
    const [qualification] = await models.Qualification.create([{
      store: storeId, reviewer: reviewerId, qualificationCategory, authorityScopes,
      credentialIssuer, credentialType, protectedEvidenceReference,
      validFrom: from, validThrough: through, status: 'pending', revision: 0, createdBy: actorId
    }], { session });
    await appendQualificationEvent(models, {
      store: storeId, qualification: qualification._id, reviewer: reviewerId, actor: actorId,
      eventType: 'registered', evidenceReference: protectedEvidenceReference,
      reason: String(reason).trim(), idempotencyKey: String(idempotencyKey).trim()
    }, session);
    await appendAudit(models, { actor, storeId, action: 'leave_policy_reviewer_registered', details: `Reviewer qualification ${qualification._id} registered as pending verification.` }, session);
    return qualification;
  });
};

const verifyReviewerQualification = async ({ qualificationId, verifierId, verificationEvidenceReference, reason, idempotencyKey, verifyCredential, models: injected } = {}) => {
  const models = { ...defaultModels(), ...injected };
  if (typeof verifyCredential !== 'function') throw err('leave_policy_trusted_verifier_required', 'Credential verification requires a trusted server-side verifier.');
  return withTransaction(models.Policy, async session => {
    const qualification = await models.Qualification.findById(qualificationId).select('+protectedEvidenceReference +verificationEvidenceReference').session(session);
    if (!qualification) throw err('leave_policy_qualification_missing', 'Reviewer qualification was not found.');
    const verifier = await loadActor(models, verifierId, qualification.store, session, 'leave.approve');
    if (idOf(verifierId) === idOf(qualification.reviewer) || isFinance(verifier) || qualification.status !== 'pending' || !String(reason || '').trim()) {
      throw err('leave_policy_qualification_verification_denied', 'Verification requires a distinct Store Owner/Admin, pending qualification, and audit reason.');
    }
    const duplicate = await models.QualificationEvent.findOne({ store: qualification.store, idempotencyKey }).session(session).lean();
    if (duplicate) {
      if (idOf(duplicate.qualification) === idOf(qualificationId) && idOf(duplicate.actor) === idOf(verifierId) && duplicate.eventType === 'verified') return qualification;
      throw err('leave_policy_idempotency_conflict', 'Qualification verification idempotency key has already been used.');
    }
    const verification = await verifyCredential(qualification.toObject(), { verifierId: idOf(verifierId), storeId: idOf(qualification.store) });
    if (verification?.verified !== true || !String(verification.evidenceReference || '').trim()) {
      const rejected = await appendQualificationEvent(models, {
        store: qualification.store, qualification: qualification._id, reviewer: qualification.reviewer, actor: verifierId,
        eventType: 'verification_rejected',
        reason: String(reason).trim(), idempotencyKey: String(idempotencyKey).trim()
      }, session);
      await appendAudit(models, { actor: verifier, storeId: qualification.store, action: 'leave_policy_reviewer_verification_rejected', details: `Reviewer qualification verification rejected (${rejected._id}).` }, session);
      return { qualification, event: rejected, verified: false };
    }
    const now = new Date();
    const result = await models.Qualification.updateOne({ _id: qualification._id, store: qualification.store, status: 'pending', revision: qualification.revision }, {
      $set: { status: 'verified', verifiedBy: verifierId, verifiedAt: now, verificationEvidenceReference: String(verification.evidenceReference).trim() },
      $inc: { revision: 1 }
    }, { session, [workflowCapability.optionName]: workflowCapability.token });
    if (result.modifiedCount !== 1) throw err('leave_policy_qualification_conflict', 'Qualification changed concurrently; reload before retrying.');
    await appendQualificationEvent(models, {
      store: qualification.store, qualification: qualification._id, reviewer: qualification.reviewer, actor: verifierId,
      eventType: 'verified', evidenceReference: String(verification.evidenceReference).trim(),
      reason: String(reason).trim(), idempotencyKey: String(idempotencyKey).trim()
    }, session);
    await appendAudit(models, { actor: verifier, storeId: qualification.store, action: 'leave_policy_reviewer_verified', details: `Reviewer qualification ${qualification._id} verified.` }, session);
    return models.Qualification.findById(qualification._id).session(session);
  });
};

const revokeReviewerQualification = async ({ qualificationId, actorId, reason, idempotencyKey, models: injected } = {}) => {
  const models = { ...defaultModels(), ...injected };
  return withTransaction(models.Policy, async session => {
    const qualification = await models.Qualification.findById(qualificationId).session(session);
    if (!qualification) throw err('leave_policy_qualification_missing', 'Reviewer qualification was not found.');
    const actor = await loadActor(models, actorId, qualification.store, session, 'leave.approve');
    if (qualification.status !== 'verified' || !String(reason || '').trim()) throw err('leave_policy_qualification_not_revocable', 'Only a verified qualification may be revoked, with an audit reason.');
    const duplicate = await models.QualificationEvent.findOne({ store: qualification.store, idempotencyKey }).session(session).lean();
    if (duplicate) {
      if (idOf(duplicate.qualification) === idOf(qualificationId) && idOf(duplicate.actor) === idOf(actorId) && duplicate.eventType === 'revoked') return qualification;
      throw err('leave_policy_idempotency_conflict', 'Qualification revocation idempotency key has already been used.');
    }
    const now = new Date();
    const result = await models.Qualification.updateOne({ _id: qualification._id, store: qualification.store, status: 'verified', revision: qualification.revision }, {
      $set: { status: 'revoked', revokedBy: actorId, revokedAt: now, revocationReason: String(reason).trim() }, $inc: { revision: 1 }
    }, { session, [workflowCapability.optionName]: workflowCapability.token });
    if (result.modifiedCount !== 1) throw err('leave_policy_qualification_conflict', 'Qualification changed concurrently; reload before retrying.');
    await appendQualificationEvent(models, {
      store: qualification.store, qualification: qualification._id, reviewer: qualification.reviewer, actor: actorId,
      eventType: 'revoked', evidenceReference: undefined, reason: String(reason).trim(), idempotencyKey: String(idempotencyKey).trim()
    }, session);
    await appendAudit(models, { actor, storeId: qualification.store, action: 'leave_policy_reviewer_revoked', details: `Reviewer qualification ${qualification._id} revoked.` }, session);
    return models.Qualification.findById(qualification._id).session(session);
  });
};

const submitPolicyForReview = async ({ policyId, storeId, actorId, reason, idempotencyKey, models: injected } = {}) => {
  const models = { ...defaultModels(), ...injected };
  return withTransaction(models.Policy, async session => {
    const actor = await loadActor(models, actorId, storeId, session, 'leave.approve');
    const policy = await readPolicy(models, policyId, storeId, session);
    const retry = await findRetry(models, policy, { key: idempotencyKey, actorId, stage: 'submission', decision: 'submitted' }, session);
    if (retry) return { policy, event: retry, replayed: true };
    assertPolicy(policy);
    if (!['draft', 'changes_requested'].includes(policy.reviewState)) throw err('leave_policy_transition_invalid', 'Only a draft or changes-requested policy can be submitted.');
    const { event, replayed } = await appendDecision(models, policy, { actorId, stage: 'submission', decision: 'submitted', reason, idempotencyKey }, session);
    if (!replayed) await claimWorkflowRevision(models, policy, session, { reviewState: 'submitted_for_review' });
    if (!replayed) await appendAudit(models, { actor, storeId, action: 'leave_policy_submitted', details: `Policy ${policy._id} revision ${policy.contentRevision} submitted (${event._id}).` }, session);
    return { policy: await models.Policy.findById(policy._id).session(session), event, replayed };
  });
};

const createDraftPolicy = async ({ storeId, actorId, policy: definition, reason, idempotencyKey, models: injected } = {}) => {
  const models = { ...defaultModels(), ...injected };
  const allowed = new Set(['leaveTypeKey', 'version', 'scopeType', 'scopeKey', 'classification', 'effectiveFrom', 'effectiveThrough', 'eligibility', 'unitsPerDay', 'paidTreatment', 'accrual', 'carryover', 'sourceReferences']);
  if (!definition || Object.keys(definition).some(key => !allowed.has(key)) || !String(reason || '').trim() || !String(idempotencyKey || '').trim()) {
    throw err('leave_policy_create_invalid', 'Draft policy creation accepts only policy configuration fields, an audit reason, and an idempotency key.');
  }
  return withTransaction(models.Policy, async session => {
    const actor = await loadActor(models, actorId, storeId, session, 'leave.approve');
    const prior = await models.Decision.findOne({ store: storeId, idempotencyKey }).select('+evidenceReference').session(session).lean();
    if (prior) {
      if (prior.stage === 'workflow' && prior.decision === 'created' && idOf(prior.actor) === idOf(actorId)
        && prior.evidenceReference === calculatePolicyChecksum(definition) && prior.reason === String(reason).trim()) {
        return { policy: await models.Policy.findOne({ _id: prior.policy, store: storeId }).session(session), event: prior, replayed: true };
      }
      throw err('leave_policy_idempotency_conflict', 'This Store-scoped idempotency key was already used for a different policy action.');
    }
    const [policy] = await models.Policy.create([{
      ...definition, store: storeId, status: 'draft', reviewState: 'draft', contentRevision: 1, workflowRevision: 0, createdBy: actorId
    }], { session });
    assertPolicy(policy);
    const { event } = await appendDecision(models, policy, { actorId, stage: 'workflow', decision: 'created', reason, idempotencyKey, evidenceReference: calculatePolicyChecksum(definition) }, session);
    await appendAudit(models, { actor, storeId, action: 'leave_policy_draft_created', details: `Inactive draft policy ${policy._id} version ${policy.version} created (${event._id}).` }, session);
    return { policy, event, replayed: false };
  });
};

const requestPolicyChanges = async ({ policyId, storeId, actorId, reviewerQualificationId, reason, idempotencyKey, models: injected } = {}) => {
  const models = { ...defaultModels(), ...injected };
  return withTransaction(models.Policy, async session => {
    const policy = await readPolicy(models, policyId, storeId, session);
    const retry = await findRetry(models, policy, { key: idempotencyKey, actorId, stage: 'compliance_review', decision: 'changes_requested' }, session);
    if (retry) return { policy, event: retry, replayed: true };
    if (!['submitted_for_review', 'compliance_reviewed'].includes(policy.reviewState)) throw err('leave_policy_transition_invalid', 'Changes can only be requested while a policy is in review.');
    const qualification = await requireQualification(models, reviewerQualificationId, actorId, policy, session);
    const actor = await models.User.findOne({ _id: actorId, store: storeId, isDeleted: { $ne: true } }).session(session).lean();
    const { event, replayed } = await appendDecision(models, policy, { actorId, reviewerQualification: qualification._id, stage: 'compliance_review', decision: 'changes_requested', reason, idempotencyKey }, session);
    if (!replayed) {
      const claim = await models.Qualification.updateOne({ _id: qualification._id, store: storeId, status: 'verified', revision: qualification.revision }, { $inc: { revision: 1 } }, { session, [workflowCapability.optionName]: workflowCapability.token });
      if (claim.modifiedCount !== 1) throw err('leave_policy_qualification_conflict', 'Reviewer qualification changed while requesting changes.');
      await claimWorkflowRevision(models, policy, session, { reviewState: 'changes_requested' });
    }
    if (!replayed) await appendAudit(models, { actor, storeId, action: 'leave_policy_changes_requested', details: `Policy ${policy._id} needs changes (${event._id}).` }, session);
    return { policy: await models.Policy.findById(policy._id).session(session), event, replayed };
  });
};

const requireQualification = async (models, qualificationId, reviewerId, policy, session, decisionId) => {
  const qualification = await models.Qualification.findOne({ _id: qualificationId, store: policy.store, reviewer: reviewerId, status: 'verified' })
    .select('+verificationEvidenceReference').session(session).lean();
  const now = new Date();
  const from = new Date(policy.effectiveFrom);
  const scope = qualification?.authorityScopes || {};
  const validScope = qualification && ((scope.leaveTypeKeys || []).includes('all') || (scope.leaveTypeKeys || []).includes(policy.leaveTypeKey))
    && (scope.policyClassifications || []).includes(policy.classification)
    && (!decisionId || (scope.decisionIds || []).includes('all') || (scope.decisionIds || []).includes(decisionId));
  if (!qualification || new Date(qualification.validFrom) > now || new Date(qualification.validThrough) < now
    || new Date(qualification.validFrom) > from || new Date(qualification.validThrough) < from || !validScope) {
    throw err('leave_policy_qualification_invalid', 'An active, unexpired, Store- and policy-scoped verified reviewer qualification is required.');
  }
  const reviewer = await models.User.findOne({ _id: reviewerId, store: policy.store, isDeleted: { $ne: true }, isActive: { $ne: false } }).session(session).lean();
  if (!reviewer || isFinance(reviewer)) throw err('leave_policy_reviewer_invalid', 'Finance users and users outside this Store cannot review leave policy.');
  return qualification;
};

const recordComplianceReview = async ({ policyId, storeId, reviewerId, reviewerQualificationId, decision, reason, evidenceReference, idempotencyKey, models: injected } = {}) => {
  const models = { ...defaultModels(), ...injected };
  const allowed = new Set(['approved', 'changes_requested', 'rejected']);
  if (!allowed.has(decision) || !String(reason || '').trim()) throw err('leave_policy_review_input_invalid', 'Compliance decision and an audit reason are required.');
  return withTransaction(models.Policy, async session => {
    const policy = await readPolicy(models, policyId, storeId, session);
    const retry = await findRetry(models, policy, { key: idempotencyKey, actorId: reviewerId, stage: 'compliance_review', decision }, session);
    if (retry) return { policy, event: retry, replayed: true };
    if (policy.reviewState !== 'submitted_for_review') throw err('leave_policy_transition_invalid', 'Only a submitted policy may receive compliance review.');
    const qualification = await requireQualification(models, reviewerQualificationId, reviewerId, policy, session);
    const reviewer = await models.User.findOne({ _id: reviewerId, store: storeId, isDeleted: { $ne: true }, isActive: { $ne: false } }).session(session).lean();
    const eventDecision = decision;
    const { event, replayed } = await appendDecision(models, policy, {
      actorId: reviewerId, reviewerQualification: qualification._id, stage: 'compliance_review', decision: eventDecision,
      reason, evidenceReference: evidenceReference || qualification.verificationEvidenceReference, idempotencyKey
    }, session);
    if (!replayed) {
      const update = decision === 'approved' ? 'compliance_reviewed' : decision === 'changes_requested' ? 'changes_requested' : 'rejected';
      // Touch the qualification in the same transaction so revocation and a review cannot both commit from stale reads.
      const qualificationClaim = await models.Qualification.updateOne({ _id: qualification._id, store: storeId, status: 'verified', revision: qualification.revision }, { $inc: { revision: 1 } }, { session, [workflowCapability.optionName]: workflowCapability.token });
      if (qualificationClaim.modifiedCount !== 1) throw err('leave_policy_qualification_conflict', 'Reviewer qualification changed during review; retry with current evidence.');
      await claimWorkflowRevision(models, policy, session, { reviewState: update });
      await appendAudit(models, { actor: reviewer, storeId, action: `leave_policy_compliance_${decision}`, details: `Policy ${policy._id} compliance decision ${decision} recorded (${event._id}).` }, session);
    }
    return { policy: await models.Policy.findById(policy._id).session(session), event, replayed };
  });
};

const approvePolicyAsOwner = async ({ policyId, storeId, actorId, reason, effectiveDate, idempotencyKey, models: injected } = {}) => {
  const models = { ...defaultModels(), ...injected };
  return withTransaction(models.Policy, async session => {
    const actor = await loadActor(models, actorId, storeId, session, 'leave.approve');
    const policy = await readPolicy(models, policyId, storeId, session);
    const retry = await findRetry(models, policy, { key: idempotencyKey, actorId, stage: 'owner_approval', decision: 'approved' }, session);
    if (retry) return { policy, event: retry, replayed: true };
    if (policy.reviewState !== 'compliance_reviewed') throw err('leave_policy_transition_invalid', 'A currently compliance-reviewed policy is required before Owner/Admin approval.');
    if (!String(reason || '').trim() || new Date(effectiveDate).getTime() !== new Date(policy.effectiveFrom).getTime()) throw err('leave_policy_effective_date_invalid', 'Owner/Admin approval requires a reason and an explicit effective date matching the policy.');
    const compliance = await models.Decision.findOne({ store: storeId, policy: policy._id, stage: 'compliance_review', decision: 'approved', contentRevision: policy.contentRevision, policyChecksum: decisionChecksum(policy) }).sort({ createdAt: -1 }).session(session).lean();
    if (!compliance || idOf(compliance.actor) === idOf(actorId)) throw err('leave_policy_independent_approval_required', 'Owner/Admin approval must be independent of the current compliance reviewer and use the reviewed checksum.');
    const qualification = await requireQualification(models, compliance.reviewerQualification, compliance.actor, policy, session);
    const qualificationClaim = await models.Qualification.updateOne({ _id: qualification._id, store: storeId, status: 'verified', revision: qualification.revision }, { $inc: { revision: 1 } }, { session, [workflowCapability.optionName]: workflowCapability.token });
    if (qualificationClaim.modifiedCount !== 1) throw err('leave_policy_qualification_conflict', 'The compliance qualification changed before Owner/Admin approval.');
    const { event, replayed } = await appendDecision(models, policy, { actorId, stage: 'owner_approval', decision: 'approved', reason, idempotencyKey }, session);
    if (!replayed) {
      await claimWorkflowRevision(models, policy, session, { reviewState: 'owner_approved' });
      await appendAudit(models, { actor, storeId, action: 'leave_policy_owner_approved', details: `Policy ${policy._id} revision ${policy.contentRevision} approved for readiness evaluation (${event._id}).` }, session);
    }
    return { policy: await models.Policy.findById(policy._id).session(session), event, replayed };
  });
};

const rejectPolicyAsOwner = async ({ policyId, storeId, actorId, reason, idempotencyKey, models: injected } = {}) => {
  const models = { ...defaultModels(), ...injected };
  return withTransaction(models.Policy, async session => {
    const actor = await loadActor(models, actorId, storeId, session, 'leave.approve');
    const policy = await readPolicy(models, policyId, storeId, session);
    const retry = await findRetry(models, policy, { key: idempotencyKey, actorId, stage: 'owner_approval', decision: 'rejected' }, session);
    if (retry) return { policy, event: retry, replayed: true };
    if (!['submitted_for_review', 'compliance_reviewed'].includes(policy.reviewState) || !String(reason || '').trim()) {
      throw err('leave_policy_transition_invalid', 'Owner/Admin rejection requires a submitted policy and a documented reason.');
    }
    const { event, replayed } = await appendDecision(models, policy, { actorId, stage: 'owner_approval', decision: 'rejected', reason, idempotencyKey }, session);
    if (!replayed) {
      await claimWorkflowRevision(models, policy, session, { reviewState: 'rejected' });
      await appendAudit(models, { actor, storeId, action: 'leave_policy_owner_rejected', details: `Policy ${policy._id} rejected (${event._id}).` }, session);
    }
    return { policy: await models.Policy.findById(policy._id).session(session), event, replayed };
  });
};

const recordPolicyDecision = async ({ policyId, storeId, reviewerId, reviewerQualificationId, decisionId, decision, reason, evidenceReference, idempotencyKey, models: injected } = {}) => {
  const models = { ...defaultModels(), ...injected };
  if (!DECISION_IDS.includes(decisionId) || !['approved', 'not_applicable', 'changes_requested'].includes(decision) || !String(reason || '').trim()) {
    throw err('leave_policy_decision_invalid', 'A valid LP-01 through LP-22 decision, disposition, and reason are required.');
  }
  return withTransaction(models.Policy, async session => {
    const policy = await readPolicy(models, policyId, storeId, session);
    const retry = await findRetry(models, policy, { key: idempotencyKey, actorId: reviewerId, stage: 'policy_decision', decision }, session);
    if (retry && retry.decisionId === decisionId) return { policy, event: retry, replayed: true };
    if (!['submitted_for_review', 'compliance_reviewed'].includes(policy.reviewState)) throw err('leave_policy_transition_invalid', 'Policy decisions are recorded only during review.');
    const qualification = await requireQualification(models, reviewerQualificationId, reviewerId, policy, session, decisionId);
    const reviewer = await models.User.findOne({ _id: reviewerId, store: storeId, isDeleted: { $ne: true }, isActive: { $ne: false } }).session(session).lean();
    const { event, replayed } = await appendDecision(models, policy, { actorId: reviewerId, reviewerQualification: qualification._id, stage: 'policy_decision', decision, decisionId, reason, evidenceReference: evidenceReference || qualification.verificationEvidenceReference, idempotencyKey }, session);
    if (!replayed) {
      const claim = await models.Qualification.updateOne({ _id: qualification._id, store: storeId, status: 'verified', revision: qualification.revision }, { $inc: { revision: 1 } }, { session, [workflowCapability.optionName]: workflowCapability.token });
      if (claim.modifiedCount !== 1) throw err('leave_policy_qualification_conflict', 'Reviewer qualification changed while recording the decision.');
      await claimWorkflowRevision(models, policy, session);
      await appendAudit(models, { actor: reviewer, storeId, action: 'leave_policy_question_decision', details: `${decisionId} ${decision} recorded for policy ${policy._id} (${event._id}).` }, session);
    }
    return { policy: await models.Policy.findById(policy._id).session(session), event, replayed };
  });
};

const reviseDraftPolicy = async ({ policyId, storeId, actorId, patch, reason, idempotencyKey, models: injected } = {}) => {
  const models = { ...defaultModels(), ...injected };
  const allowed = new Set(['leaveTypeKey', 'scopeType', 'scopeKey', 'classification', 'effectiveFrom', 'effectiveThrough', 'eligibility', 'unitsPerDay', 'paidTreatment', 'accrual', 'carryover', 'sourceReferences']);
  if (!patch || Object.keys(patch).some(key => !allowed.has(key)) || !String(reason || '').trim()) throw err('leave_policy_revision_invalid', 'Only documented draft policy fields may be revised, with an audit reason.');
  return withTransaction(models.Policy, async session => {
    const actor = await loadActor(models, actorId, storeId, session, 'leave.approve');
    const policy = await readPolicy(models, policyId, storeId, session);
    const patchHash = calculatePolicyChecksum(patch);
    const priorRevision = await models.Decision.findOne({ store: storeId, policy: policyId, idempotencyKey }).select('+evidenceReference').session(session).lean();
    if (priorRevision) {
      if (idOf(priorRevision.actor) === idOf(actorId) && priorRevision.stage === 'workflow' && priorRevision.decision === 'revision_changed'
        && priorRevision.evidenceReference === patchHash && priorRevision.reason === String(reason).trim()) {
        return { policy: await models.Policy.findById(policyId).session(session), event: priorRevision, replayed: true };
      }
      throw err('leave_policy_idempotency_conflict', 'This idempotency key was already used for a different policy revision.');
    }
    const checksum = decisionChecksum(policy);
    const prior = await ensureIdempotency(models, { policyId, storeId, key: idempotencyKey, actorId, stage: 'workflow', decision: 'revision_changed', checksum, contentRevision: policy.contentRevision }, session);
    if (prior) return { policy, event: prior, replayed: true };
    const revision = Number(policy.contentRevision || 1) + 1;
    const update = { ...patch, contentRevision: revision, reviewState: 'draft' };
    const result = await models.Policy.updateOne({ _id: policy._id, store: storeId, status: 'draft', workflowRevision: policy.workflowRevision }, { $set: update, $inc: { workflowRevision: 1 }, $currentDate: { updatedAt: true } }, { session, runValidators: true, [workflowCapability.optionName]: workflowCapability.token });
    if (result.modifiedCount !== 1) throw err('leave_policy_workflow_conflict', 'Policy changed concurrently; reload before revising.');
    const revised = await models.Policy.findById(policy._id).session(session);
    assertPolicy(revised);
    const { event } = await appendDecision(models, revised, { actorId, stage: 'workflow', decision: 'revision_changed', reason, idempotencyKey, evidenceReference: patchHash }, session);
    await appendAudit(models, { actor, storeId, action: 'leave_policy_revision_changed', details: `Policy ${policy._id} moved to content revision ${revision}; prior approvals remain historical and are stale.` }, session);
    return { policy: revised, event, replayed: false };
  });
};

const withdrawPolicy = async ({ policyId, storeId, actorId, reason, idempotencyKey, models: injected } = {}) => {
  const models = { ...defaultModels(), ...injected };
  return withTransaction(models.Policy, async session => {
    const actor = await loadActor(models, actorId, storeId, session, 'leave.approve');
    const policy = await readPolicy(models, policyId, storeId, session);
    const retry = await findRetry(models, policy, { key: idempotencyKey, actorId, stage: 'workflow', decision: 'withdrawn' }, session);
    if (retry) return { policy, event: retry, replayed: true };
    if (!['submitted_for_review', 'changes_requested', 'compliance_reviewed', 'owner_approved'].includes(policy.reviewState)) throw err('leave_policy_transition_invalid', 'Only an in-review or owner-approved draft can be withdrawn.');
    const { event, replayed } = await appendDecision(models, policy, { actorId, stage: 'workflow', decision: 'withdrawn', reason, idempotencyKey }, session);
    if (!replayed) {
      await claimWorkflowRevision(models, policy, session, { reviewState: 'withdrawn' });
      await appendAudit(models, { actor, storeId, action: 'leave_policy_withdrawn', details: `Policy ${policy._id} withdrawn from review (${event._id}).` }, session);
    }
    return { policy: await models.Policy.findById(policy._id).session(session), event, replayed };
  });
};

const evaluatePolicyReadiness = async ({ policy, events = [], qualifications = [], users = [], now = new Date(), requiredDecisionIds = DECISION_IDS } = {}) => {
  const blockers = [];
  if (!policy) return { state: 'not_ready', blockers: ['Policy draft is missing.'], checksum: null };
  const checksum = decisionChecksum(policy);
  const revision = Number(policy.contentRevision || 1);
  const current = events.filter(event => event.policyChecksum === checksum && event.contentRevision === revision);
  const latest = (stage, decision) => current.filter(event => event.stage === stage && event.decision === decision).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  if (policy.status !== 'draft') blockers.push('Only an inactive draft can be evaluated.');
  if (policy.reviewState !== 'owner_approved') blockers.push('The current review state is not Owner/Admin approved.');
  try { assertPolicy(policy); } catch (error) { blockers.push(error.message); }
  if (!latest('submission', 'submitted')) blockers.push('Current policy revision has not been submitted for review.');
  const compliance = latest('compliance_review', 'approved');
  if (!compliance) blockers.push('Current policy revision has no approved compliance review.');
  else {
    const qualification = qualifications.find(item => idOf(item._id) === idOf(compliance.reviewerQualification));
    const reviewerUser = users.find(item => idOf(item._id) === idOf(compliance.actor));
    const effective = new Date(policy.effectiveFrom); const currentTime = new Date(now);
    if (!qualification || qualification.status !== 'verified' || new Date(qualification.validFrom) > currentTime
      || new Date(qualification.validThrough) < currentTime || new Date(qualification.validFrom) > effective
      || new Date(qualification.validThrough) < effective || idOf(qualification.store) !== idOf(policy.store)
      || idOf(qualification.reviewer) !== idOf(compliance.actor) || !reviewerUser || reviewerUser.isActive === false
      || idOf(reviewerUser.store) !== idOf(policy.store) || isFinance(reviewerUser)) blockers.push('Compliance reviewer qualification or reviewer account is missing, stale, revoked, expired, inactive, or out of scope.');
  }
  const owner = latest('owner_approval', 'approved');
  if (!owner) blockers.push('Current policy revision lacks independent Owner/Admin approval.');
  if (owner && compliance && idOf(owner.actor) === idOf(compliance.actor)) blockers.push('Compliance reviewer and Owner/Admin approver must be different people.');
  const ownerUser = owner && users.find(item => idOf(item._id) === idOf(owner.actor));
  if (owner && (!ownerUser || ownerUser.isActive === false || idOf(ownerUser.store) !== idOf(policy.store) || isFinance(ownerUser) || !isStoreAdmin(ownerUser))) {
    blockers.push('Owner/Admin approval actor is no longer an active Store Owner/Admin for this Store.');
  }
  const latestByDecision = new Map();
  current.filter(event => event.stage === 'policy_decision').sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).forEach(event => latestByDecision.set(event.decisionId, event));
  for (const decisionId of requiredDecisionIds) {
    const decision = latestByDecision.get(decisionId);
    if (!decision || !['approved', 'not_applicable'].includes(decision.decision) || !String(decision.reason || '').trim()) blockers.push(`${decisionId} has no current documented approval or not-applicable decision.`);
    else {
      const qualification = qualifications.find(item => idOf(item._id) === idOf(decision.reviewerQualification));
      const reviewerUser = users.find(item => idOf(item._id) === idOf(decision.actor));
      const scoped = qualification && qualification.status === 'verified' && idOf(qualification.store) === idOf(policy.store)
        && idOf(qualification.reviewer) === idOf(decision.actor)
        && new Date(qualification.validFrom) <= new Date(now) && new Date(qualification.validThrough) >= new Date(now)
        && new Date(qualification.validFrom) <= new Date(policy.effectiveFrom) && new Date(qualification.validThrough) >= new Date(policy.effectiveFrom)
        && ((qualification.authorityScopes?.leaveTypeKeys || []).includes('all') || (qualification.authorityScopes?.leaveTypeKeys || []).includes(policy.leaveTypeKey))
        && (qualification.authorityScopes?.policyClassifications || []).includes(policy.classification)
        && ((qualification.authorityScopes?.decisionIds || []).includes('all') || (qualification.authorityScopes?.decisionIds || []).includes(decisionId))
        && reviewerUser && reviewerUser.isActive !== false && idOf(reviewerUser.store) === idOf(policy.store) && !isFinance(reviewerUser);
      if (!scoped) blockers.push(`${decisionId} reviewer qualification is no longer verified, current, or in scope.`);
    }
  }
  if (current.some(event => ['changes_requested', 'rejected', 'withdrawn'].includes(event.decision))) blockers.push('The current policy revision has a blocking changes-requested, rejected, or withdrawn event.');
  return { state: blockers.length ? 'not_ready' : 'ready_for_activation_review', blockers, checksum, contentRevision: revision };
};

const getPolicyReadiness = async ({ policyId, storeId, models: injected, now } = {}) => {
  const models = { ...defaultModels(), ...injected };
  const policy = await models.Policy.findOne({ _id: policyId, store: storeId, status: 'draft' }).select('+checksum +approvedSnapshot').lean();
  if (!policy) return { state: 'not_ready', blockers: ['Store-scoped draft policy was not found.'], checksum: null };
  const checksum = decisionChecksum(policy);
  const events = await models.Decision.find({ store: storeId, policy: policyId }).lean();
  const qualificationIds = [...new Set(events.map(event => idOf(event.reviewerQualification)).filter(Boolean))];
  const qualifications = qualificationIds.length ? await models.Qualification.find({ _id: { $in: qualificationIds }, store: storeId }).lean() : [];
  const reviewerIds = [...new Set(events.map(event => idOf(event.actor)).filter(Boolean))];
  const users = reviewerIds.length ? await models.User.find({ _id: { $in: reviewerIds }, store: storeId, isDeleted: { $ne: true }, isActive: { $ne: false } }).lean() : [];
  return evaluatePolicyReadiness({ policy, events, qualifications, users, now });
};

module.exports = {
  DECISION_IDS, decisionChecksum, assertStoreAdmin, createDraftPolicy, registerReviewerQualification,
  verifyReviewerQualification, revokeReviewerQualification, submitPolicyForReview,
  requestPolicyChanges, recordComplianceReview, approvePolicyAsOwner, rejectPolicyAsOwner,
  recordPolicyDecision, reviseDraftPolicy, withdrawPolicy, evaluatePolicyReadiness,
  getPolicyReadiness
};
