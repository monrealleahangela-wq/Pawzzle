const crypto = require('node:crypto');
const DefaultStore = require('../models/Store');
const DefaultUser = require('../models/User');
const DefaultLeaveRequest = require('../models/LeaveRequest');
const DefaultLeavePolicyVersion = require('../models/LeavePolicyVersion');
const DefaultLeaveCreditLedgerEntry = require('../models/LeaveCreditLedgerEntry');
const DefaultLeavePolicyActivationGuard = require('../models/LeavePolicyActivationGuard');
const activationCapability = require('../utils/leavePolicyActivationCapability');
const { normalizeRole, isStoreAdmin, hasPermission } = require('../config/permissions');

const ENTRY_TYPES = new Set([
  'opening_balance', 'accrual', 'reservation', 'reservation_release', 'consumption',
  'manual_adjustment', 'carryover', 'expiry', 'reversal'
]);
const err = (code, message) => Object.assign(new Error(message), { code });
const idOf = value => String(value?._id || value || '');
const asTime = value => new Date(value).getTime();

const canonicalize = value => {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  return JSON.stringify(value);
};

const isoOrNull = value => value ? new Date(value).toISOString() : null;
const policySnapshotPayload = policy => {
  const eligibility = policy.eligibility || {};
  const accrual = policy.accrual || {};
  const carryover = policy.carryover || {};
  return {
    store: idOf(policy.store), leaveTypeKey: String(policy.leaveTypeKey || '').trim().toLowerCase(),
    version: Number(policy.version), scopeType: policy.scopeType || 'store', scopeKey: policy.scopeKey || 'all',
    classification: policy.classification, effectiveFrom: isoOrNull(policy.effectiveFrom),
    effectiveThrough: isoOrNull(policy.effectiveThrough),
    eligibility: {
      employmentStatuses: [...(eligibility.employmentStatuses || [])].map(value => String(value).toLowerCase()).sort(),
      employeeCategories: [...(eligibility.employeeCategories || [])].map(value => String(value).toLowerCase()).sort(),
      minimumServiceDays: eligibility.minimumServiceDays == null ? null : Number(eligibility.minimumServiceDays)
    },
    unitsPerDay: Number(policy.unitsPerDay), paidTreatment: policy.paidTreatment,
    accrual: {
      mode: accrual.mode || 'none', units: accrual.units == null ? null : Number(accrual.units),
      period: accrual.period || null, firstAccrualDate: isoOrNull(accrual.firstAccrualDate)
    },
    carryover: {
      enabled: Boolean(carryover.enabled), maximumUnits: carryover.maximumUnits == null ? null : Number(carryover.maximumUnits),
      expiresAfterMonths: carryover.expiresAfterMonths == null ? null : Number(carryover.expiresAfterMonths)
    },
    sourceReferences: (policy.sourceReferences || []).map(source => ({
      title: String(source.title || '').trim(), issuer: String(source.issuer || '').trim(),
      url: String(source.url || '').trim(), effectiveDate: isoOrNull(source.effectiveDate)
    }))
  };
};

const calculatePolicyChecksum = payload => crypto.createHash('sha256').update(canonicalize(payload)).digest('hex');

const buildApprovedPolicySnapshot = (policy, approvals) => {
  if (!approvals?.businessApprovedBy || !approvals?.complianceReviewedBy
    || idOf(approvals.businessApprovedBy) === idOf(approvals.complianceReviewedBy)) {
    throw err('independent_policy_approval_required', 'Policy activation requires distinct Owner/Admin business approval and qualified compliance review.');
  }
  const snapshot = policySnapshotPayload(policy);
  return { snapshot, checksum: calculatePolicyChecksum(snapshot) };
};

const validatePolicyIntegrity = policy => {
  if (!policy || !policy.store || !policy.leaveTypeKey || !Number.isInteger(policy.version)
    || !policy.effectiveFrom || !Number.isFinite(asTime(policy.effectiveFrom))
    || (policy.effectiveThrough && (!Number.isFinite(asTime(policy.effectiveThrough)) || asTime(policy.effectiveThrough) < asTime(policy.effectiveFrom)))) {
    throw err('invalid_leave_policy', 'Leave policy scope, version, and effective dates are invalid.');
  }
  if (['active', 'retired'].includes(policy.status)) {
    const evidence = policy.approvalEvidence || {};
    if (!evidence.businessApprovedBy || !evidence.complianceReviewedBy || !evidence.complianceQualificationReference
      || idOf(evidence.businessApprovedBy) === idOf(evidence.complianceReviewedBy)
      || !evidence.approvedAt || !evidence.effectiveApprovedAt || !evidence.approvalReference) {
      throw err('leave_policy_approval_evidence_missing', 'Approved policy is missing distinct business/compliance evidence or dates.');
    }
    if (!policy.approvedSnapshot || !policy.checksum || calculatePolicyChecksum(policy.approvedSnapshot) !== String(policy.checksum).toLowerCase()) {
      throw err('leave_policy_integrity_mismatch', 'Active leave policy failed approved snapshot integrity validation.');
    }
  }
  return true;
};

const executeLean = async (query, session) => {
  let scoped = query;
  if (session && scoped?.session) scoped = scoped.session(session);
  if (scoped?.lean) scoped = scoped.lean();
  return scoped;
};

/* Read-only foreign-key/scope check for future transactional ledger writers. */
const validateLedgerReferences = async ({
  entry, session,
  models = {}
} = {}) => {
  if (!entry) throw err('ledger_entry_required', 'A ledger entry payload is required for reference validation.');
  const Store = models.Store || DefaultStore;
  const User = models.User || DefaultUser;
  const LeaveRequest = models.LeaveRequest || DefaultLeaveRequest;
  const LeavePolicyVersion = models.LeavePolicyVersion || DefaultLeavePolicyVersion;
  const LeaveCreditLedgerEntry = models.LeaveCreditLedgerEntry || DefaultLeaveCreditLedgerEntry;
  const storeId = idOf(entry.store);
  const employeeId = idOf(entry.employee);
  const actorId = idOf(entry.actor);
  const approverId = idOf(entry.authorizedBy);
  if (!storeId || !employeeId || !actorId) throw err('ledger_reference_missing', 'Store, employee, and actor references are required.');

  const [store, employee, actor, policy] = await Promise.all([
    executeLean(Store.findOne({ _id: entry.store }), session),
    executeLean(User.findOne({ _id: entry.employee, store: entry.store, isDeleted: { $ne: true } }), session),
    executeLean(User.findOne({ _id: entry.actor, store: entry.store, isDeleted: { $ne: true } }), session),
    (async () => {
      let query = LeavePolicyVersion.findOne({ _id: entry.policyVersion, store: entry.store, leaveTypeKey: entry.leaveTypeKey });
      if (query.select) query = query.select('+approvedSnapshot +checksum');
      return executeLean(query, session);
    })()
  ]);
  if (!store) throw err('ledger_store_missing', 'Referenced Store does not exist.');
  if (!employee) throw err('ledger_employee_store_mismatch', 'Referenced employee does not exist in the ledger Store or is deleted.');
  if (!actor) throw err('ledger_actor_store_mismatch', 'Ledger actor must be an existing account in the same Store.');
  if (!policy || !['active', 'retired'].includes(policy.status)) throw err('ledger_policy_not_approved', 'Ledger entries require an approved active or historical retired policy version.');
  validatePolicyIntegrity(policy);
  const effective = asTime(entry.effectiveDate);
  if (!Number.isFinite(effective) || effective < asTime(policy.effectiveFrom)
    || (policy.effectiveThrough && effective > asTime(policy.effectiveThrough))
    || effective < asTime(policy.approvalEvidence?.effectiveApprovedAt)) {
    throw err('ledger_policy_not_effective', 'Policy approval and effective dates do not cover the ledger entry date.');
  }
  if (Number(entry.unitsPerDaySnapshot) !== Number(policy.unitsPerDay)) throw err('ledger_unit_scale_mismatch', 'Ledger unit scale must match the applied policy version.');

  let leaveRequest = null;
  if (entry.sourceType === 'leave_request') {
    leaveRequest = await executeLean(LeaveRequest.findOne({ _id: entry.sourceReference, store: entry.store, employee: entry.employee }), session);
    if (!leaveRequest) throw err('ledger_leave_request_scope_mismatch', 'Referenced leave request does not belong to this Store and employee.');
  }
  let reversedEntry = null;
  if (entry.entryType === 'reversal') {
    reversedEntry = await executeLean(LeaveCreditLedgerEntry.findOne({
      _id: entry.reversalOf, store: entry.store, employee: entry.employee,
      leaveTypeKey: entry.leaveTypeKey, entryType: { $ne: 'reversal' }
    }), session);
    if (!reversedEntry || Number(entry.units) !== Math.abs(Number(reversedEntry.units))) throw err('ledger_reversal_target_invalid', 'Reversal must reference one matching original entry and its exact magnitude.');
    const priorReversal = await executeLean(LeaveCreditLedgerEntry.findOne({ entryType: 'reversal', reversalOf: entry.reversalOf }), session);
    if (priorReversal) throw err('ledger_entry_already_reversed', 'Referenced ledger entry already has a reversal.');
  }
  let authorizedBy = null;
  if (['manual_adjustment', 'reversal'].includes(entry.entryType)) {
    authorizedBy = await executeLean(User.findOne({ _id: entry.authorizedBy, store: entry.store, isDeleted: { $ne: true } }), session);
    if (!authorizedBy || !approverId || approverId === actorId || approverId === employeeId) {
      throw err('ledger_independent_authorization_invalid', 'Manual adjustments and reversals require a distinct, same-Store authorizer who is not the employee.');
    }
  }
  return { store, employee, actor, policy, leaveRequest, reversedEntry, authorizedBy };
};

const intervalsOverlap = (left, right) => asTime(left.effectiveFrom) <= (right.effectiveThrough ? asTime(right.effectiveThrough) : Infinity)
  && asTime(right.effectiveFrom) <= (left.effectiveThrough ? asTime(left.effectiveThrough) : Infinity);

const scopesOverlap = (left, right) => {
  if ((left.scopeType || 'store') === 'store' || (right.scopeType || 'store') === 'store') return true;
  return String(left.scopeKey || 'all').toLowerCase() === String(right.scopeKey || 'all').toLowerCase();
};

const assertNoOverlappingActivePolicy = (candidate, existingPolicies) => {
  validatePolicyIntegrity(candidate);
  if (candidate.status !== 'active') return true;
  const conflict = (existingPolicies || []).find(existing => existing.status === 'active'
    && idOf(existing.store) === idOf(candidate.store)
    && String(existing.leaveTypeKey).toLowerCase() === String(candidate.leaveTypeKey).toLowerCase()
    && scopesOverlap(existing, candidate) && intervalsOverlap(existing, candidate)
    && idOf(existing) !== idOf(candidate));
  if (conflict) throw err('overlapping_active_leave_policy', `Active policy ${conflict.version} overlaps this Store, leave type, scope, and effective period.`);
  return true;
};

const activateLeavePolicyVersion = async ({
  policyId, actorId, complianceReviewerId, approvalReference, effectiveDate,
  verifyComplianceReviewer, models = {}
} = {}) => {
  const Policy = models.LeavePolicyVersion || DefaultLeavePolicyVersion;
  const Guard = models.LeavePolicyActivationGuard || DefaultLeavePolicyActivationGuard;
  const User = models.User || DefaultUser;
  const Store = models.Store || DefaultStore;
  if (!policyId || !actorId || !complianceReviewerId || !String(approvalReference || '').trim()
    || !effectiveDate || typeof verifyComplianceReviewer !== 'function') {
    throw err('leave_policy_activation_input_invalid', 'Policy, Store approver, qualified reviewer, approval reference, explicit effective date, and trusted reviewer verifier are required.');
  }

  const connection = Policy.db;
  if (!connection || typeof connection.startSession !== 'function') {
    throw err('leave_policy_transactions_required', 'Policy activation requires a transaction-capable MongoDB connection.');
  }
  const initialPolicy = await Policy.findById(policyId).lean();
  if (!initialPolicy) throw err('leave_policy_missing', 'The requested leave policy version does not exist.');
  const initialStoreId = initialPolicy.store;
  const initialLeaveType = String(initialPolicy.leaveTypeKey || '').trim().toLowerCase();
  await Guard.createIndexes();
  try {
    await Guard.updateOne({ store: initialStoreId, leaveTypeKey: initialLeaveType }, { $setOnInsert: { revision: 0 } }, { upsert: true });
  } catch (error) {
    // A concurrent upsert can lose the guard's unique-key race. Reuse the
    // winner only after confirming it exists; activation itself still claims it
    // transactionally below.
    if (error.code !== 11000 || !await Guard.exists({ store: initialStoreId, leaveTypeKey: initialLeaveType })) throw error;
  }
  const session = await connection.startSession();
  let activatedPolicy;
  try {
    await session.withTransaction(async () => {
      const policyQuery = Policy.findById(policyId).select('+approvedSnapshot +checksum');
      const policy = await policyQuery.session(session);
      if (!policy) throw err('leave_policy_missing', 'The requested leave policy version does not exist.');

      const storeId = idOf(policy.store);
      const leaveTypeKey = String(policy.leaveTypeKey || '').trim().toLowerCase();
      if (!storeId || !/^[a-z0-9][a-z0-9_-]{0,59}$/.test(leaveTypeKey)
        || !['store', 'employee_category'].includes(policy.scopeType)
        || (policy.scopeType === 'store' && policy.scopeKey !== 'all')
        || (policy.scopeType === 'employee_category' && !String(policy.scopeKey || '').trim())
        || !Number.isFinite(asTime(policy.effectiveFrom)) || (policy.effectiveThrough && asTime(policy.effectiveThrough) < asTime(policy.effectiveFrom))) {
        throw err('invalid_leave_policy_scope', 'Policy Store, leave type, scope, or effective-date interval is invalid.');
      }
      if (new Date(effectiveDate).getTime() !== asTime(policy.effectiveFrom)) {
        throw err('leave_policy_effective_date_mismatch', 'The explicitly approved effective date must match the draft policy effectiveFrom date.');
      }
      if (!Array.isArray(policy.sourceReferences) || policy.sourceReferences.length === 0
        || policy.sourceReferences.some(source => !source.title || !source.issuer || !/^https:\/\//i.test(source.url || ''))) {
        throw err('leave_policy_sources_required', 'At least one complete source document (title, issuer, HTTPS URL) is required before activation.');
      }

      const [store, actor, reviewer] = await Promise.all([
        Store.findById(policy.store).session(session).lean(),
        User.findOne({ _id: actorId, store: policy.store, isDeleted: { $ne: true } }).session(session).lean(),
        User.findOne({ _id: complianceReviewerId, store: policy.store, isDeleted: { $ne: true } }).session(session).lean()
      ]);
      const financeActor = normalizeRole(actor) === 'finance_staff';
      const financeReviewer = normalizeRole(reviewer) === 'finance_staff';
      if (!store) throw err('leave_store_missing', 'The policy Store does not exist.');
      if (!actor || !reviewer || idOf(actor) === idOf(reviewer) || financeActor || financeReviewer
        || !isStoreAdmin(actor) || !hasPermission(actor, 'leave.approve')) {
        throw err('leave_policy_activation_forbidden', 'Activation requires a same-Store Owner/Admin with effective leave approval authority and a distinct non-Finance reviewer.');
      }
      const reviewerQualification = await verifyComplianceReviewer(reviewer, { storeId, policyId: idOf(policy), leaveTypeKey });
      if (reviewerQualification?.verified !== true || !String(reviewerQualification.evidenceReference || '').trim()) {
        throw err('leave_policy_compliance_review_unverified', "The independent reviewer's qualification could not be verified.");
      }

      const approvals = {
        businessApprovedBy: actor._id,
        complianceReviewedBy: reviewer._id,
        complianceQualificationReference: String(reviewerQualification.evidenceReference).trim(),
        approvedAt: new Date(),
        effectiveApprovedAt: new Date(effectiveDate),
        approvalReference: String(approvalReference).trim()
      };
      const { snapshot, checksum } = buildApprovedPolicySnapshot(policy, approvals);

      if (policy.status === 'active') {
        validatePolicyIntegrity(policy);
        const sameActivation = String(policy.checksum).toLowerCase() === checksum
          && idOf(policy.approvalEvidence?.businessApprovedBy) === idOf(actor._id)
          && idOf(policy.approvalEvidence?.complianceReviewedBy) === idOf(reviewer._id)
          && String(policy.approvalEvidence?.complianceQualificationReference || '') === approvals.complianceQualificationReference
          && String(policy.approvalEvidence?.approvalReference || '') === approvals.approvalReference
          && asTime(policy.approvalEvidence?.effectiveApprovedAt) === asTime(approvals.effectiveApprovedAt);
        if (!sameActivation) throw err('leave_policy_already_activated', 'This policy version is already active under different approval evidence.');
        activatedPolicy = policy;
        return;
      }
      if (policy.status !== 'draft') throw err('leave_policy_not_draft', 'Only a draft leave policy version can be activated.');

      const guardClaim = await Guard.updateOne({ store: policy.store, leaveTypeKey }, { $inc: { revision: 1 } }, { session });
      if (guardClaim.matchedCount !== 1) throw err('leave_policy_activation_guard_missing', 'Could not acquire the Store/leave-type activation guard.');

      const existing = await Policy.find({ store: policy.store, leaveTypeKey, status: 'active' })
        .select('+approvedSnapshot +checksum').session(session).lean();
      const candidate = policy.toObject({ depopulate: true });
      candidate.status = 'active';
      candidate.approvalEvidence = approvals;
      candidate.approvedSnapshot = snapshot;
      candidate.checksum = checksum;
      assertNoOverlappingActivePolicy(candidate, existing);

      policy.status = 'active';
      policy.approvalEvidence = approvals;
      policy.approvedSnapshot = snapshot;
      policy.checksum = checksum;
      await policy.validate();
      const result = await Policy.updateOne({ _id: policy._id, store: policy.store, status: 'draft' }, {
        $set: { status: 'active', approvalEvidence: approvals, approvedSnapshot: snapshot, checksum, updatedAt: new Date() }
      }, { session, runValidators: true, [activationCapability.optionName]: activationCapability.token });
      if (result.modifiedCount !== 1) throw err('leave_policy_activation_state_conflict', 'Policy draft state changed before activation; no activation was applied.');
      activatedPolicy = await Policy.findById(policy._id).select('+approvedSnapshot +checksum').session(session);
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' });
  } finally {
    await session.endSession();
  }
  return activatedPolicy;
};

const selectActiveLeavePolicy = ({ policies = [], storeId, leaveTypeKey, applicableDate, employeeCategory } = {}) => {
  const at = asTime(applicableDate);
  if (!storeId || !leaveTypeKey || !Number.isFinite(at)) throw err('invalid_leave_policy_selection', 'Store, stable leave type, and valid applicable date are required.');
  const matches = policies.filter(policy => policy.status === 'active'
    && idOf(policy.store) === idOf(storeId)
    && String(policy.leaveTypeKey).toLowerCase() === String(leaveTypeKey).toLowerCase()
    && (policy.scopeType === 'store' || (policy.scopeType === 'employee_category' && employeeCategory
      && String(policy.scopeKey).toLowerCase() === String(employeeCategory).toLowerCase()))
    && asTime(policy.effectiveFrom) <= at
    && (!policy.effectiveThrough || asTime(policy.effectiveThrough) >= at));
  matches.forEach(validatePolicyIntegrity);
  if (!matches.length) throw err('active_leave_policy_missing', `No active approved leave policy covers ${String(leaveTypeKey)} on ${new Date(at).toISOString().slice(0, 10)}; no fallback was used.`);
  if (matches.length !== 1) throw err('ambiguous_active_leave_policy', 'More than one active leave policy applies; resolve overlapping policy scopes before use.');
  return matches[0];
};

const addIssue = (issues, code, message, entry) => issues.push({ code, message, entryId: entry?._id ? idOf(entry) : undefined });

/*
 * Read-only projection. All quantities are exact integer minutes. Supported
 * accounting signs: opening/accrual/carryover add credit; adjustment is signed;
 * reservation reduces available; release restores it; consumption moves a
 * reserved amount to consumed; expiry reduces available; reversal negates the
 * referenced entry's complete accounting effect. No data is repaired here.
 */
const reconcileLeaveCredits = ({ entries = [], policies = [], leaveRequests = [], expectedReversalOfIds = [], storeId, employeeId, leaveTypeKey } = {}) => {
  const issues = [];
  const idempotency = new Set();
  const semanticKeys = new Set();
  const policyById = new Map(policies.map(policy => [idOf(policy), policy]));
  const requestIds = new Set(leaveRequests.map(request => idOf(request)));
  const ordered = [...entries].sort((a, b) => Number(a.entryType === 'reversal') - Number(b.entryType === 'reversal')
    || asTime(a.effectiveDate) - asTime(b.effectiveDate)
    || asTime(a.createdAt || a.effectiveDate) - asTime(b.createdAt || b.effectiveDate)
    || idOf(a).localeCompare(idOf(b)));
  const byId = new Map(ordered.map(entry => [idOf(entry), entry]));
  const effectsById = new Map();
  const totals = { totalEarnedUnits: 0, reservedUnits: 0, consumedUnits: 0, expiredUnits: 0, adjustmentUnits: 0 };

  for (const entry of ordered) {
    const type = entry.entryType;
    const units = entry.units;
    const entryStore = idOf(entry.store);
    const entryEmployee = idOf(entry.employee);
    const key = `${entryStore}|${entryEmployee}|${String(entry.leaveTypeKey || '').toLowerCase()}|${entry.idempotencyKey}`;
    if (idempotency.has(key)) addIssue(issues, 'duplicate_idempotency_key', 'Multiple entries use the same idempotency key.', entry);
    idempotency.add(key);
    if (!ENTRY_TYPES.has(type) || !Number.isSafeInteger(units) || units === 0 || (type !== 'manual_adjustment' && units < 0)) {
      addIssue(issues, 'invalid_ledger_entry', 'Entry type or integer minute amount is invalid.', entry);
    }
    if ((storeId && entryStore !== idOf(storeId)) || (employeeId && entryEmployee !== idOf(employeeId))) {
      addIssue(issues, 'store_employee_mismatch', 'Ledger entry does not match the requested Store and employee.', entry);
    }
    if (leaveTypeKey && String(entry.leaveTypeKey).toLowerCase() !== String(leaveTypeKey).toLowerCase()) {
      addIssue(issues, 'leave_type_mismatch', 'Ledger entry does not match the requested leave type.', entry);
    }
    const policy = policyById.get(idOf(entry.policyVersion));
    if (!policy) addIssue(issues, 'invalid_policy_reference', 'Ledger entry references a missing policy version.', entry);
    else {
      if (idOf(policy.store) !== entryStore || String(policy.leaveTypeKey).toLowerCase() !== String(entry.leaveTypeKey).toLowerCase()) {
        addIssue(issues, 'policy_scope_mismatch', 'Policy Store or leave type does not match the ledger entry.', entry);
      }
      try { validatePolicyIntegrity(policy); } catch (error) { addIssue(issues, error.code || 'invalid_policy', error.message, entry); }
      const entryDate = asTime(entry.effectiveDate);
      if (!['active', 'retired'].includes(policy.status) || !Number.isFinite(entryDate)
        || entryDate < asTime(policy.effectiveFrom)
        || (policy.effectiveThrough && entryDate > asTime(policy.effectiveThrough))
        || entryDate < asTime(policy.approvalEvidence?.effectiveApprovedAt)) {
        addIssue(issues, 'policy_not_effective', 'Policy was not approved or effective on this ledger entry date.', entry);
      }
      if (Number(entry.unitsPerDaySnapshot) !== Number(policy.unitsPerDay)) addIssue(issues, 'policy_unit_scale_mismatch', 'Ledger unit scale differs from the referenced policy version.', entry);
    }
    if (entry.sourceType === 'leave_request' && !requestIds.has(idOf(entry.sourceReference))) {
      addIssue(issues, 'orphan_leave_request', 'Ledger entry references a leave request not present in the supplied request set.', entry);
    }
    const semanticType = ['accrual', 'reservation', 'consumption'].includes(type) ? type : null;
    if (semanticType) {
      const semanticKey = `${entryStore}|${entryEmployee}|${entry.leaveTypeKey}|${semanticType}|${idOf(entry.sourceReference)}`;
      if (semanticKeys.has(semanticKey)) addIssue(issues, `duplicate_${semanticType}`, `More than one ${semanticType} entry exists for its source reference.`, entry);
      semanticKeys.add(semanticKey);
    }
    let effect;
    let reversedTarget = null;
    switch (type) {
      case 'opening_balance':
      case 'accrual':
      case 'carryover':
        effect = { earned: units, reserved: 0, consumed: 0, expired: 0, adjustment: 0 };
        break;
      case 'manual_adjustment':
        effect = { earned: 0, reserved: 0, consumed: 0, expired: 0, adjustment: units };
        break;
      case 'reservation': effect = { earned: 0, reserved: units, consumed: 0, expired: 0, adjustment: 0 }; break;
      case 'reservation_release': effect = { earned: 0, reserved: -units, consumed: 0, expired: 0, adjustment: 0 }; break;
      case 'consumption': effect = { earned: 0, reserved: -units, consumed: units, expired: 0, adjustment: 0 }; break;
      case 'expiry': effect = { earned: 0, reserved: 0, consumed: 0, expired: units, adjustment: 0 }; break;
      case 'reversal': {
        const reversed = byId.get(idOf(entry.reversalOf));
        if (!reversed || idOf(reversed) === idOf(entry)) {
          addIssue(issues, 'missing_reversal_target', 'Reversal references a missing ledger entry.', entry);
          effect = { earned: 0, reserved: 0, consumed: 0, expired: 0, adjustment: 0 };
        } else {
          reversedTarget = reversed;
          const original = effectsById.get(idOf(reversed));
          if (!original) {
            addIssue(issues, 'invalid_reversal_order', 'Reversal target must precede the reversal and cannot itself be a reversal.', entry);
            effect = { earned: 0, reserved: 0, consumed: 0, expired: 0, adjustment: 0 };
          } else if (units !== Math.abs(reversed.units)) {
            addIssue(issues, 'reversal_amount_mismatch', 'Reversal must exactly match the referenced entry amount.', entry);
            effect = { earned: 0, reserved: 0, consumed: 0, expired: 0, adjustment: 0 };
          } else effect = Object.fromEntries(Object.entries(original).map(([name, amount]) => [name, -amount]));
        }
        break;
      }
      default: effect = { earned: 0, reserved: 0, consumed: 0, expired: 0, adjustment: 0 };
    }
    effectsById.set(idOf(entry), effect);
    totals.totalEarnedUnits += effect.earned;
    totals.reservedUnits += effect.reserved;
    totals.consumedUnits += effect.consumed;
    totals.expiredUnits += effect.expired;
    totals.adjustmentUnits += effect.adjustment;
  }

  // Reconcile each request by exact signed totals. Timestamp ties are common
  // under concurrency, so validity must not depend on arbitrary event ordering.
  const requestReservations = new Map();
  for (const entry of ordered) {
    const target = entry.entryType === 'reversal' ? byId.get(idOf(entry.reversalOf)) : entry;
    if (!target || target.sourceType !== 'leave_request'
      || !['reservation', 'reservation_release', 'consumption'].includes(target.entryType)) continue;
    const effect = effectsById.get(idOf(entry));
    if (!effect) continue;
    const requestId = idOf(target.sourceReference);
    let reservation = requestReservations.get(requestId);
    if (!reservation) {
      reservation = {
        remaining: 0, total: 0, store: idOf(target.store), employee: idOf(target.employee),
        leaveTypeKey: String(target.leaveTypeKey).toLowerCase(), policyVersion: idOf(target.policyVersion)
      };
      requestReservations.set(requestId, reservation);
    }
    if (reservation.store !== idOf(target.store) || reservation.employee !== idOf(target.employee)
      || reservation.leaveTypeKey !== String(target.leaveTypeKey).toLowerCase()
      || reservation.policyVersion !== idOf(target.policyVersion)
      || idOf(entry.policyVersion) !== idOf(target.policyVersion)) {
      addIssue(issues, 'cross_policy_reconciliation', 'Reservation, release, consumption, and reversal must retain the same Store, employee, leave type, and policy version.', entry);
    }
    reservation.remaining += effect.reserved;
    if (target.entryType === 'reservation') reservation.total += effect.reserved;
  }
  requestReservations.forEach((reservation, requestId) => {
    if (reservation.total <= 0 || reservation.remaining < 0 || reservation.remaining > reservation.total) {
      issues.push({ code: 'reservation_exceeded', message: `Leave request ${requestId} has releases or consumption exceeding its net reservation.` });
    }
  });

  if (totals.reservedUnits < 0) issues.push({ code: 'negative_reserved_balance', message: 'Reconciled reserved leave units are negative.' });
  const availableUnits = totals.totalEarnedUnits + totals.adjustmentUnits - totals.reservedUnits - totals.consumedUnits - totals.expiredUnits;
  if (availableUnits < 0) issues.push({ code: 'negative_available_balance', message: 'Reconciled available leave units are negative.' });
  const reversedCounts = new Map();
  ordered.filter(entry => entry.entryType === 'reversal').forEach(entry => {
    const targetId = idOf(entry.reversalOf);
    reversedCounts.set(targetId, (reversedCounts.get(targetId) || 0) + 1);
    if (reversedCounts.get(targetId) > 1) addIssue(issues, 'duplicate_reversal', 'Ledger entry has more than one reversal.', entry);
  });
  expectedReversalOfIds.forEach(targetId => {
    if (!reversedCounts.has(idOf(targetId))) issues.push({
      code: 'missing_reversal', message: `Expected a reversal for ledger entry ${idOf(targetId)}, but none exists.`, entryId: idOf(targetId)
    });
  });
  return {
    ...totals,
    availableUnits,
    reconciledBalanceUnits: availableUnits,
    isReconciled: issues.length === 0,
    issues
  };
};

module.exports = {
  ENTRY_TYPES: [...ENTRY_TYPES],
  policySnapshotPayload,
  calculatePolicyChecksum,
  buildApprovedPolicySnapshot,
  validatePolicyIntegrity,
  validateLedgerReferences,
  activateLeavePolicyVersion,
  assertNoOverlappingActivePolicy,
  selectActiveLeavePolicy,
  reconcileLeaveCredits
};
