const {
  LEGACY_STAFF_ROLE_MAP,
  SPECIALIZED_OPERATIONAL_ROLES,
  normalizeRole
} = require('../config/permissions');
const {
  compensationRevisions,
  compensationSegmentsForPeriod,
  employmentRanges
} = require('./payrollCompensation');

// Payroll follows the same active operational-role policy as authorization.
// Schema-readable retired aliases remain available for historical records but
// must not enter a newly computed payroll snapshot.
const PAYROLL_STAFF_ROLES = [...SPECIALIZED_OPERATIONAL_ROLES];
const PAYROLL_STAFF_TYPES = Object.entries(LEGACY_STAFF_ROLE_MAP)
  .filter(([, canonicalRole]) => SPECIALIZED_OPERATIONAL_ROLES.has(canonicalRole))
  .map(([staffType]) => staffType);

const PAYROLL_EMPLOYMENT_STATUSES = new Set(['active', 'probationary', 'part_time', 'contract']);
const INACTIVE_ACCOUNT_STATUSES = new Set(['archived', 'suspended', 'inactive']);

const staffIdentityFilter = () => ({
  $or: [
    { role: { $in: PAYROLL_STAFF_ROLES } },
    { role: 'staff', staffType: { $in: PAYROLL_STAFF_TYPES } }
  ]
});

// Keep inactive employment records visible to authorized HR users so they can
// complete or correct setup. This filter never makes those records payroll-eligible.
const payrollRosterFilter = () => ({
  isDeleted: { $ne: true },
  staffStatus: { $ne: 'archived' },
  $or: [
    { role: 'staff' },
    { role: { $in: [...PAYROLL_STAFF_ROLES, 'delivery_dispatcher'] } }
  ]
});

// Missing lifecycle fields retain the repository's established legacy-active
// behavior. Every explicit inactive state remains authoritative.
const activePayrollEmployeeFilter = () => ({
  isDeleted: { $ne: true },
  isActive: { $ne: false },
  staffStatus: { $nin: [...INACTIVE_ACCOUNT_STATUSES] },
  'employmentProfile.employmentStatus': { $nin: ['inactive', 'terminated'] },
  ...staffIdentityFilter()
});

const payrollEmployeeQuery = (storeId, { includeInactive = false } = {}) => ({
  store: storeId,
  ...(includeInactive ? payrollRosterFilter() : activePayrollEmployeeFilter())
});

const employeeName = employee => `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim()
  || employee?.username
  || 'Employee';

const payrollEligibility = (employee, periodEnd = new Date(), periodStart = periodEnd) => {
  if (!employee || employee.isDeleted === true || employee.staffStatus === 'archived') {
    return { eligible: false, code: 'account_archived', message: 'This staff account is archived and cannot be included in payroll.' };
  }
  const canonicalRole = normalizeRole(employee);
  if (canonicalRole === 'retired_delivery_dispatcher') {
    return { eligible: false, code: 'role_retired', message: 'Dispatcher is a retired role and is excluded from new payroll. Reassign an active staff role if this person is still employed.' };
  }
  if (!SPECIALIZED_OPERATIONAL_ROLES.has(canonicalRole)) {
    return { eligible: false, code: 'not_store_staff', message: 'This account is not an eligible Store staff identity.' };
  }
  const historicalEmployment = employee.employmentProfile
    ? employmentRanges(employee.employmentProfile, periodStart, periodEnd)
    : [];
  const hasClosedEmploymentHistory = Boolean(employee.employmentProfile?.employmentEndDate)
    || Boolean(employee.employmentProfile?.employmentHistory?.length);
  if ((employee.isActive === false || INACTIVE_ACCOUNT_STATUSES.has(employee.staffStatus))
    && (!hasClosedEmploymentHistory || !historicalEmployment.length)) {
    return { eligible: false, code: 'account_inactive', message: 'Activate this account in Staff Management before including it in payroll.' };
  }

  if (!employee.employmentProfile) {
    return { eligible: false, code: 'employment_missing', message: 'Create an employment record in Compensation before including this employee in payroll.' };
  }

  const employmentStatus = employee.employmentProfile.employmentStatus;
  if (employmentStatus && !PAYROLL_EMPLOYMENT_STATUSES.has(employmentStatus) && !historicalEmployment.length) {
    return { eligible: false, code: 'employment_inactive', message: 'Set an active employment status in Compensation before including this employee in payroll.' };
  }

  if (!historicalEmployment.length && employee.employmentProfile.dateHired && new Date(employee.employmentProfile.dateHired) > new Date(periodEnd)) {
    return { eligible: false, code: 'employment_not_started', message: 'This employee was hired after the selected payroll period ended.' };
  }

  if (!historicalEmployment.length) {
    return { eligible: false, code: 'employment_inactive', message: 'This employee was not actively employed during the selected payroll period.' };
  }

  const revisions = compensationRevisions(employee.employmentProfile);
  if (!revisions.length) {
    return { eligible: false, code: 'compensation_missing', message: 'Configure a positive salary, daily, or hourly base rate in Compensation before computing payroll.' };
  }

  const coverage = compensationSegmentsForPeriod(employee.employmentProfile, periodStart, periodEnd);
  if (!coverage.segments.length) {
    return { eligible: false, code: 'compensation_not_effective', message: 'Compensation is configured but is not effective in this payroll period.' };
  }

  return {
    eligible: true,
    code: 'eligible',
    message: coverage.legacyReviewRequired
      ? 'Payroll setup uses a legacy per-period salary. Its existing meaning is preserved; authorized HR should classify future compensation explicitly.'
      : 'Payroll setup is complete.',
    reviewRequired: coverage.legacyReviewRequired || coverage.coverageGap,
    compensationBasis: coverage.segments.at(-1).compensation.compensationBasis
  };
};

module.exports = {
  PAYROLL_STAFF_ROLES,
  PAYROLL_STAFF_TYPES,
  PAYROLL_EMPLOYMENT_STATUSES,
  activePayrollEmployeeFilter,
  employeeName,
  payrollEligibility,
  payrollEmployeeQuery,
  payrollRosterFilter
};
