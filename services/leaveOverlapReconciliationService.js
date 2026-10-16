const mongoose = require('mongoose');
const LeaveOverlapClaim = require('../models/LeaveOverlapClaim');
const LeaveRequest = require('../models/LeaveRequest');
const { ACTIVE_REQUEST_STATUSES, leaveDateKeys } = require('./leaveWorkflowService');

const idOf = value => String(value?._id || value || '');

const buildClaimReconciliationPlan = (requests, claims) => {
  const active = requests.filter(request => ACTIVE_REQUEST_STATUSES.includes(request.status))
    .slice().sort((left, right) => idOf(left.employee).localeCompare(idOf(right.employee))
      || new Date(left.startDate) - new Date(right.startDate) || idOf(left).localeCompare(idOf(right)));
  const activeById = new Map(active.map(request => [idOf(request), request]));
  const claimedByDate = new Map();
  const dateKeysByRequest = new Map();
  const conflictsByPair = new Map();
  const invalidRanges = [];

  for (const request of active) {
    try { dateKeysByRequest.set(idOf(request), leaveDateKeys(request.startDate, request.endDate)); }
    catch (error) {
      invalidRanges.push({ leaveRequestId: idOf(request), employeeId: idOf(request.employee), code: error.code || 'invalid_leave_range', message: error.message });
      dateKeysByRequest.set(idOf(request), []);
    }
  }

  const addConflict = (leftId, rightId, employeeId, workDate, source) => {
    const pair = [leftId, rightId].sort();
    const key = `${pair[0]}:${pair[1]}`;
    const prior = conflictsByPair.get(key) || { leaveRequestIds: pair, employeeId, dates: [], sources: new Set() };
    if (!prior.dates.includes(workDate)) prior.dates.push(workDate);
    prior.sources.add(source);
    conflictsByPair.set(key, prior);
  };

  for (const claim of claims) {
    const ownerId = idOf(claim.leaveRequest);
    const key = `${idOf(claim.employee)}:${claim.workDate}`;
    if (!claimedByDate.has(key)) claimedByDate.set(key, new Set());
    claimedByDate.get(key).add(ownerId);
  }

  for (const request of active) {
    const requestId = idOf(request);
    for (const workDate of dateKeysByRequest.get(requestId) || []) {
      const key = `${idOf(request.employee)}:${workDate}`;
      const owners = claimedByDate.get(key) || new Set();
      for (const ownerId of owners) {
        if (ownerId !== requestId) addConflict(requestId, ownerId, idOf(request.employee), workDate, 'existing_claim');
      }
      owners.add(requestId);
      claimedByDate.set(key, owners);
    }
  }

  const conflictedIds = new Set([...conflictsByPair.values()].flatMap(item => item.leaveRequestIds));
  const existing = new Set(claims.map(claim => `${idOf(claim.leaveRequest)}:${claim.workDate}`));
  const plannedClaims = [];
  for (const request of active) {
    const requestId = idOf(request);
    if (conflictedIds.has(requestId) || invalidRanges.some(item => item.leaveRequestId === requestId)) continue;
    for (const workDate of dateKeysByRequest.get(requestId) || []) {
      const key = `${requestId}:${workDate}`;
      if (existing.has(key)) continue;
      plannedClaims.push({ store: request.store, employee: request.employee, workDate, leaveRequest: request._id });
    }
  }

  return {
    activeRequestCount: active.length,
    alreadyClaimedDays: existing.size,
    plannedClaimCount: plannedClaims.length,
    plannedClaims,
    conflicts: [...conflictsByPair.values()].map(item => ({
      leaveRequestIds: item.leaveRequestIds,
      employeeId: item.employeeId,
      dates: item.dates.sort(),
      sources: [...item.sources].sort(),
      requiresManualResolution: true
    })),
    invalidRanges,
    orphanClaims: claims.filter(claim => !activeById.has(idOf(claim.leaveRequest))).map(claim => ({
      claimId: idOf(claim), leaveRequestId: idOf(claim.leaveRequest), employeeId: idOf(claim.employee), workDate: claim.workDate,
      requiresManualResolution: true
    }))
  };
};

const reconcileLegacyLeaveClaims = async ({ storeId, employeeId, apply = false }) => {
  if (!mongoose.isValidObjectId(storeId) || (employeeId && !mongoose.isValidObjectId(employeeId))) {
    throw Object.assign(new Error('A valid Store and optional employee ID are required for leave reconciliation.'), { statusCode: 400 });
  }
  if (apply) await LeaveOverlapClaim.createIndexes();
  const build = async session => {
    const scope = { store: storeId, status: { $in: ACTIVE_REQUEST_STATUSES } };
    const claimScope = { store: storeId };
    if (employeeId) { scope.employee = employeeId; claimScope.employee = employeeId; }
    let requestQuery = LeaveRequest.find(scope).sort({ employee: 1, startDate: 1, _id: 1 });
    let claimQuery = LeaveOverlapClaim.find(claimScope).sort({ employee: 1, workDate: 1 });
    if (session) { requestQuery = requestQuery.session(session); claimQuery = claimQuery.session(session); }
    const requests = await requestQuery.lean();
    const claims = await claimQuery.lean();
    let result = buildClaimReconciliationPlan(requests, claims);
    const inserted = apply && result.plannedClaims.length
      ? await LeaveOverlapClaim.insertMany(result.plannedClaims, { session, ordered: true })
      : [];
    return {
      ...result,
      plannedClaims: apply ? [] : result.plannedClaims,
      insertedClaimCount: inserted.length,
      applied: Boolean(apply),
      requestHistoryChanged: false,
      requiresManualResolution: result.conflicts.length > 0 || result.invalidRanges.length > 0 || result.orphanClaims.length > 0
    };
  };
  if (!apply) return build(null);
  let result;
  await mongoose.connection.transaction(async session => { result = await build(session); });
  return result;
};

module.exports = { buildClaimReconciliationPlan, reconcileLegacyLeaveClaims };
