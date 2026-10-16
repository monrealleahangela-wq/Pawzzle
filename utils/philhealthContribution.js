const { calculateRuleChecksum, selectRuleVersion } = require('./statutoryRuleRegistry');

const PHILHEALTH_AGENCY = 'PhilHealth';
const PHILHEALTH_PROGRAM = 'employed_member_premium';
const PHILHEALTH_COVERAGE = 'private_formal_economy';

// Candidate parameters are documented for review but deliberately inactive:
// the original PhilHealth CY2026 advisory was not retrieved from a first-party
// agency channel. A payroll operator cannot turn this source-code object into
// an active database rule.
const candidate = {
  agency: PHILHEALTH_AGENCY,
  program: PHILHEALTH_PROGRAM,
  employeeCoverage: PHILHEALTH_COVERAGE,
  issuanceId: 'PhilHealth Circular 2020-0005; CY2026 rate reported by PIA from PhilHealth advisory dated 2026-05-06',
  sourceUrl: 'https://www.philhealth.gov.ph/circulars/2020/circ2020-0005.pdf',
  sourceVerifiedOn: '2026-10-14T00:00:00.000Z',
  effectiveFrom: '2026-01-01T00:00:00.000Z',
  effectiveThrough: null,
  version: 'philhealth-employed-2026-5pct-candidate-v1',
  verificationStatus: 'unverified',
  activationStatus: 'inactive',
  parameters: Object.freeze({
    currency: 'PHP', contributionPeriod: 'calendar_month',
    premiumRateBasisPoints: 500, incomeFloorPHP: 10000, incomeCeilingPHP: 100000,
    employeeShareBasisPoints: 250, employerShareBasisPoints: 250,
    salaryBase: 'monthly_basic_salary_excluding_commissions_overtime_allowances_13th_month_bonus_gratuity_and_unpaid-time-deductions',
    rounding: 'each equal share rounded to nearest centavo, half up',
    '2026Evidence': 'PIA reported PhilHealth advisory 2026-05-06; first-party advisory document not obtained'
  })
};
candidate.checksum = calculateRuleChecksum(candidate);
const PHILHEALTH_2026_CANDIDATE = Object.freeze(candidate);

const error = (code, message) => Object.assign(new Error(message), { code });
const toCents = value => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-7) {
    throw error('invalid_monthly_basic_salary', 'Provide a non-negative monthly basic salary in PHP with no more than two decimal places.');
  }
  return Math.round(value * 100);
};
const toPHP = cents => Number((cents / 100).toFixed(2));
const roundRatioHalfUp = (numerator, denominator) => Math.floor((numerator + (denominator / 2)) / denominator);

const calculatePhilHealthContribution = ({ monthlyBasicSalaryPHP, employeeClassification, contributionMonth, ruleVersions }) => {
  const salaryCents = toCents(monthlyBasicSalaryPHP);
  if (!salaryCents) throw error('missing_monthly_basic_salary', 'A positive, explicit monthly basic salary is required; do not substitute gross compensation or prorated pay.');
  if (employeeClassification !== PHILHEALTH_COVERAGE) throw error('missing_or_unsupported_employee_classification', 'An explicit private formal-economy employed-member classification is required.');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(contributionMonth || ''))) throw error('invalid_contribution_month', 'PhilHealth contribution month must be YYYY-MM.');

  const rule = selectRuleVersion({
    rules: ruleVersions, agency: PHILHEALTH_AGENCY, program: PHILHEALTH_PROGRAM,
    employeeCoverage: PHILHEALTH_COVERAGE, applicableDate: `${contributionMonth}-01T00:00:00.000Z`
  });
  const parameters = rule.parameters;
  if (parameters.salaryBase !== PHILHEALTH_2026_CANDIDATE.parameters.salaryBase
    || parameters.rounding !== PHILHEALTH_2026_CANDIDATE.parameters.rounding
    || ![500, 10000, 100000, 250].every(value => [parameters.premiumRateBasisPoints, parameters.incomeFloorPHP, parameters.incomeCeilingPHP, parameters.employeeShareBasisPoints].includes(value))
    || parameters.employerShareBasisPoints !== 250) {
    throw error('unsupported_philhealth_rule_parameters', `PhilHealth rule ${rule.version} has parameters without a reviewed calculator implementation.`);
  }
  const baseCents = Math.min(Math.max(salaryCents, parameters.incomeFloorPHP * 100), parameters.incomeCeilingPHP * 100);
  const employeeCents = roundRatioHalfUp(baseCents * parameters.employeeShareBasisPoints, 10000);
  const employerCents = roundRatioHalfUp(baseCents * parameters.employerShareBasisPoints, 10000);
  return {
    agency: PHILHEALTH_AGENCY,
    contributionMonth,
    ruleVersion: rule.version,
    ruleChecksum: rule.checksum,
    monthlyBasicSalaryPHP: toPHP(salaryCents),
    assessedSalaryBasePHP: toPHP(baseCents),
    totalPremiumPHP: toPHP(employeeCents + employerCents),
    employee: { premium: toPHP(employeeCents), total: toPHP(employeeCents) },
    employer: { premium: toPHP(employerCents), total: toPHP(employerCents) },
    limitations: ['PhilHealth CY2026 parameters remain an inactive candidate until the first-party agency advisory is obtained.', 'Monthly obligation is not prorated for partial employment and is not allocated among pay dates here.']
  };
};

module.exports = {
  PHILHEALTH_AGENCY, PHILHEALTH_PROGRAM, PHILHEALTH_COVERAGE,
  PHILHEALTH_2026_CANDIDATE, calculatePhilHealthContribution
};
