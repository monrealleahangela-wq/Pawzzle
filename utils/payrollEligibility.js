const PAYROLL_STAFF_ROLES = [
  'manager', 'service_staff', 'cashier', 'inventory_staff', 'procurement_officer',
  'finance_staff', 'veterinarian', 'groomer', 'trainer', 'boarding_staff',
  'delivery_rider', 'auditor'
];

const PAYROLL_EMPLOYMENT_STATUSES = new Set(['active', 'probationary', 'part_time', 'contract']);
const INACTIVE_ACCOUNT_STATUSES = new Set(['archived', 'suspended', 'inactive']);

const staffIdentityFilter = () => ({
  $or: [{ role: 'staff' }, { role: { $in: PAYROLL_STAFF_ROLES } }]
});

// Keep inactive employment records visible to authorized HR users so they can
// complete or correct setup. This filter never makes those records payroll-eligible.
const payrollRosterFilter = () => ({
  isDeleted: { $ne: true },
  staffStatus: { $ne: 'archived' },
  ...staffIdentityFilter()
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

const payrollEligibility = (employee, periodEnd = new Date()) => {
  if (!employee || employee.isDeleted === true || employee.staffStatus === 'archived') {
    return { eligible: false, code: 'account_archived', message: 'This staff account is archived and cannot be included in payroll.' };
  }
  const directRole = PAYROLL_STAFF_ROLES.includes(employee.role);
  if (employee.role !== 'staff' && !directRole) {
    return { eligible: false, code: 'not_store_staff', message: 'This account is not an eligible Store staff identity.' };
  }
  if (employee.isActive === false || INACTIVE_ACCOUNT_STATUSES.has(employee.staffStatus)) {
    return { eligible: false, code: 'account_inactive', message: 'Activate this account in Staff Management before including it in payroll.' };
  }

  const employmentStatus = employee.employmentProfile?.employmentStatus;
  if (employmentStatus && !PAYROLL_EMPLOYMENT_STATUSES.has(employmentStatus)) {
    return { eligible: false, code: 'employment_inactive', message: 'Set an active employment status in Compensation before including this employee in payroll.' };
  }

  const compensation = employee.employmentProfile?.compensation;
  const baseRate = Number(compensation?.baseRate);
  if (!compensation || !['salary', 'daily', 'hourly'].includes(compensation.compensationType) || !Number.isFinite(baseRate) || baseRate <= 0) {
    return { eligible: false, code: 'compensation_missing', message: 'Configure a positive salary, daily, or hourly base rate in Compensation before computing payroll.' };
  }

  if (compensation.effectiveDate && new Date(compensation.effectiveDate) > new Date(periodEnd)) {
    return { eligible: false, code: 'compensation_not_effective', message: 'Compensation is configured but is not effective in this payroll period.' };
  }

  return { eligible: true, code: 'eligible', message: 'Payroll setup is complete.' };
};

module.exports = {
  PAYROLL_STAFF_ROLES,
  PAYROLL_EMPLOYMENT_STATUSES,
  activePayrollEmployeeFilter,
  employeeName,
  payrollEligibility,
  payrollEmployeeQuery,
  payrollRosterFilter
};
