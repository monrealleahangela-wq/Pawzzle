const REVIEW_DATE = '2026-10-14';

const REQUIRED_STATUTORY_BLOCKERS = Object.freeze([
  {
    agency: 'SSS',
    category: 'calculation',
    code: 'sss_calculation_not_integrated',
    reason: 'An exact standalone SSS Circular 2024-006 calculator and protected employee classifications exist, but SSS is not integrated with payroll and monthly employee/employer/MPF/EC obligations are not persistently reconciled.'
  },
  {
    agency: 'PhilHealth',
    category: 'rules',
    code: 'philhealth_first_party_2026_rule_unverified',
    reason: 'PIA reported a PhilHealth CY 2026 advisory retaining 5%, PHP 10,000 floor, PHP 100,000 ceiling, and equal employed-member shares, but the first-party advisory itself was not obtained. A candidate calculator exists but no verified active 2026 rule is selected or used.'
  },
  {
    agency: 'Pag-IBIG',
    category: 'rules',
    code: 'pagibig_calculation_not_integrated',
    reason: 'A standalone Circular 460 employed-member calculator exists, based on a government-hosted Circular 460 copy and Pag-IBIG current payment guidance, but no controlled production rule activation or monthly allocation/reconciliation is implemented.'
  },
  {
    agency: 'BIR',
    category: 'employee_data',
    code: 'bir_tax_history_and_supplementary_data_unavailable',
    reason: 'Effective-dated classifications exist and the Annex E period-table calculator supports classified regular compensation, but supplementary/cumulative withholding, prior-employer/YTD history, benefit accumulation, and year-end/termination reconciliation remain unsupported.'
  },
  {
    agency: 'BIR',
    category: 'calculation',
    code: 'bir_withholding_not_integrated',
    reason: 'The standalone Annex E calculator is not integrated into payroll; RR 4-2025/RR 29-2025 de-minimis qualifications and cumulative/year-end treatment are not implemented.'
  },
  {
    agency: 'Payroll',
    category: 'employee_data',
    code: 'statutory_employee_data_not_resolved',
    reason: 'Protected effective-dated statutory and tax classification fields exist, but actual current classifications and component evidence must be explicitly recorded and validated for every included employee. No exemption or MWE status may be inferred from salary.'
  },
  {
    agency: 'Payroll',
    category: 'calculation',
    code: 'statutory_allocation_and_snapshot_unavailable',
    reason: 'Exact-centavo allocation validation exists only as a pure utility; no legally approved Store payment-timing policy, persistent concurrency-safe obligation ledger, immutable employee statutory payslip snapshot, or full payroll integration exists.'
  }
]);

const deriveReadinessStatus = ({ blockers = [] } = {}) => {
  if (blockers.some(item => item.category === 'calculation_error')) return 'blocked_calculation_error';
  if (blockers.some(item => item.category === 'rules' || item.category === 'calculation')) return 'blocked_missing_rules';
  if (blockers.some(item => item.category === 'employee_data')) return 'blocked_missing_employee_data';
  return 'blocked_missing_rules';
};

const REQUIRED_RULE_AGENCIES = ['SSS', 'PhilHealth', 'Pag-IBIG', 'BIR'];
const isStatutoryPayrollReady = (readiness, period) => {
  const snapshot = readiness?.verifiedSnapshot;
  const ruleVersions = snapshot?.ruleVersions || [];
  const rulesByAgency = new Map(ruleVersions.map(rule => [rule.agency, rule]));
  const periodStart = new Date(period?.periodStart);
  const periodEnd = new Date(period?.periodEnd);
  return readiness?.status === 'ready'
    && Array.isArray(readiness.blockingReasons)
    && readiness.blockingReasons.length === 0
    && typeof snapshot?.checksum === 'string'
    && snapshot.checksum.length > 0
    && Number.isInteger(snapshot.employeeCount)
    && snapshot.employeeCount > 0
    && snapshot.reconciledEmployeeCount === snapshot.employeeCount
    && Array.isArray(snapshot.employeeChecksums)
    && snapshot.employeeChecksums.length === snapshot.employeeCount
    && snapshot.employeeChecksums.every(checksum => typeof checksum === 'string' && checksum.length > 0)
    && Number.isFinite(periodStart.getTime())
    && Number.isFinite(periodEnd.getTime())
    && periodStart <= periodEnd
    && ruleVersions.length === REQUIRED_RULE_AGENCIES.length
    && REQUIRED_RULE_AGENCIES.every(agency => {
      const rule = rulesByAgency.get(agency);
      const effectiveFrom = new Date(rule?.effectiveFrom);
      const effectiveThrough = new Date(rule?.effectiveThrough);
      return Boolean(rule?.version && rule?.checksum)
        && Number.isFinite(effectiveFrom.getTime())
        && Number.isFinite(effectiveThrough.getTime())
        && effectiveFrom <= periodStart
        && effectiveThrough >= periodEnd;
    });
};

const assessStatutoryPayrollReadiness = () => {
  const blockingReasons = REQUIRED_STATUTORY_BLOCKERS.map(item => ({ ...item }));
  return {
    status: deriveReadinessStatus({ blockers: blockingReasons }),
    reviewedOn: REVIEW_DATE,
    blockingReasons
  };
};

const statutoryReadinessMessage = readiness => {
  const reasons = readiness?.blockingReasons || [];
  return reasons.length
    ? `Statutory payroll is blocked: ${reasons.map(item => `${item.agency}: ${item.reason}`).join(' ')}`
    : 'Statutory payroll is blocked: no verified calculation snapshot. Recompute only after an authorized, fully verified statutory rule set is active.';
};

module.exports = {
  REQUIRED_STATUTORY_BLOCKERS,
  deriveReadinessStatus,
  isStatutoryPayrollReady,
  assessStatutoryPayrollReadiness,
  statutoryReadinessMessage
};
