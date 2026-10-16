const assert = require('node:assert/strict');
const test = require('node:test');
const { calculateRuleChecksum } = require('../utils/statutoryRuleRegistry');
const {
  PHILHEALTH_2026_CANDIDATE, PHILHEALTH_COVERAGE, PHILHEALTH_PROGRAM,
  calculatePhilHealthContribution
} = require('../utils/philhealthContribution');
const {
  PAGIBIG_CIRCULAR_460_CANDIDATE, PAGIBIG_COVERAGE, PAGIBIG_PROGRAM,
  calculatePagibigContribution
} = require('../utils/pagibigContribution');

const activeRule = candidate => {
  const rule = {
    ...candidate,
    parameters: { ...candidate.parameters },
    verificationStatus: 'verified', activationStatus: 'active'
  };
  rule.checksum = calculateRuleChecksum(rule);
  return rule;
};
const phRule = activeRule(PHILHEALTH_2026_CANDIDATE);
const pagibigRule = activeRule(PAGIBIG_CIRCULAR_460_CANDIDATE);
const ph = (salary, month = '2026-06', rules = [phRule], classification = PHILHEALTH_COVERAGE) => calculatePhilHealthContribution({
  monthlyBasicSalaryPHP: salary, employeeClassification: classification,
  contributionMonth: month, ruleVersions: rules
});
const pagibig = (salary, month = '2026-06', rules = [pagibigRule], classification = PAGIBIG_COVERAGE) => calculatePagibigContribution({
  monthlyFundSalaryPHP: salary, employeeClassification: classification,
  contributionMonth: month, ruleVersions: rules
});

test('PhilHealth 2026 floor, ordinary salary, and ceiling use monthly basic salary and equal separate shares', () => {
  assert.deepEqual(ph(8000), {
    agency: 'PhilHealth', contributionMonth: '2026-06', ruleVersion: phRule.version,
    ruleChecksum: phRule.checksum, monthlyBasicSalaryPHP: 8000, assessedSalaryBasePHP: 10000,
    totalPremiumPHP: 500, employee: { premium: 250, total: 250 }, employer: { premium: 250, total: 250 },
    limitations: ['PhilHealth CY2026 parameters remain an inactive candidate until the first-party agency advisory is obtained.', 'Monthly obligation is not prorated for partial employment and is not allocated among pay dates here.']
  });
  const ordinary = ph(40000);
  assert.equal(ordinary.assessedSalaryBasePHP, 40000);
  assert.equal(ordinary.employee.total, 1000);
  assert.equal(ordinary.employer.total, 1000);
  assert.equal(ph(120000).assessedSalaryBasePHP, 100000);
  assert.equal(ph(120000).totalPremiumPHP, 5000);
});

test('PhilHealth candidate source-code rule is not active and missing rules never fall back', () => {
  assert.equal(PHILHEALTH_2026_CANDIDATE.activationStatus, 'inactive');
  assert.equal(PHILHEALTH_2026_CANDIDATE.verificationStatus, 'unverified');
  assert.throws(() => ph(20000, '2026-06', [PHILHEALTH_2026_CANDIDATE]), error => error.code === 'verified_rule_missing');
  assert.throws(() => ph(20000, '2025-12'), error => error.code === 'verified_rule_missing');
  assert.throws(() => ph(20000, '2026-06', [phRule], 'unknown'), error => error.code === 'missing_or_unsupported_employee_classification');
  assert.throws(() => ph(20000, '2026-06', [phRule, activeRule({ ...phRule, version: 'overlap', parameters: { ...phRule.parameters } })]), error => error.code === 'overlapping_active_rules');
  assert.throws(() => ph(0), error => error.code === 'missing_monthly_basic_salary');
  assert.throws(() => ph(10000.001), error => error.code === 'invalid_monthly_basic_salary');
});

test('Pag-IBIG Circular 460 employee threshold, employer counterpart, cap, and centavo rounding', () => {
  assert.deepEqual(pagibig(1500).employee, { mandatorySavings: 15, total: 15 });
  assert.deepEqual(pagibig(1500).employer, { mandatorySavings: 30, total: 30 });
  assert.equal(pagibig(1500.01).employee.total, 30);
  assert.equal(pagibig(1500.01).employer.total, 30);
  assert.equal(pagibig(10000).employee.total, 200);
  assert.equal(pagibig(10000).employer.total, 200);
  assert.equal(pagibig(99999).assessedFundSalaryPHP, 10000);
  assert.throws(() => pagibig(1000, '2026-06', [pagibigRule], 'other'), error => error.code === 'missing_or_unsupported_employee_classification');
  assert.throws(() => pagibig(10000, '2023-12'), error => error.code === 'verified_rule_missing');
  assert.throws(() => pagibig(0), error => error.code === 'missing_monthly_fund_salary');
});

