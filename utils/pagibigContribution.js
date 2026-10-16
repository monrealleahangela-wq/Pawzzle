const { calculateRuleChecksum, selectRuleVersion } = require('./statutoryRuleRegistry');

const PAGIBIG_AGENCY = 'Pag-IBIG';
const PAGIBIG_PROGRAM = 'pagibig_i_mandatory_membership_savings';
const PAGIBIG_COVERAGE = 'employed_member';
const candidate = {
  agency: PAGIBIG_AGENCY,
  program: PAGIBIG_PROGRAM,
  employeeCoverage: PAGIBIG_COVERAGE,
  issuanceId: 'HDMF Circular No. 460 (2024-01-15), effective February 2024 onwards; Circular No. 274 contribution framework',
  sourceUrl: 'https://wcms.dmw.gov.ph/uploads/DMW_ADVISORY_37_2025_01225b9fec.pdf',
  sourceVerifiedOn: '2026-10-14T00:00:00.000Z',
  effectiveFrom: '2024-02-01T00:00:00.000Z',
  effectiveThrough: null,
  version: 'pagibig-circular-460-employed-effective-2024-02-candidate-v1',
  verificationStatus: 'verified',
  activationStatus: 'inactive',
  parameters: Object.freeze({
    currency: 'PHP', contributionPeriod: 'calendar_month',
    fundSalaryDefinition: 'basic_salary_and_other_allowances',
    lowerFundSalaryLimitPHP: 1500, maximumFundSalaryPHP: 10000,
    employeeRateAtOrBelowLimitBasisPoints: 100,
    employeeRateAboveLimitBasisPoints: 200,
    employerRateBasisPoints: 200,
    rounding: 'application-nearest-centavo-half-up; agency rounding confirmation pending',
    sourceNote: 'Official DMW-hosted copy of HDMF Circular 460; Pag-IBIG official 2025 payment guides also state MFS PHP 10,000. Confirm category and payroll timing with Pag-IBIG before production activation.'
  })
};
candidate.checksum = calculateRuleChecksum(candidate);
const PAGIBIG_CIRCULAR_460_CANDIDATE = Object.freeze(candidate);

const error = (code, message) => Object.assign(new Error(message), { code });
const cents = value => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-7) {
    throw error('invalid_monthly_fund_salary', 'Provide a non-negative monthly Pag-IBIG fund salary in PHP with no more than two decimal places.');
  }
  return Math.round(value * 100);
};
const php = value => Number((value / 100).toFixed(2));
const percentage = (baseCents, basisPoints) => Math.floor((baseCents * basisPoints + 5000) / 10000);

const calculatePagibigContribution = ({ monthlyFundSalaryPHP, employeeClassification, contributionMonth, ruleVersions }) => {
  const salaryCents = cents(monthlyFundSalaryPHP);
  if (!salaryCents) throw error('missing_monthly_fund_salary', 'A positive, explicitly classified monthly fund salary is required.');
  if (employeeClassification !== PAGIBIG_COVERAGE) throw error('missing_or_unsupported_employee_classification', 'An explicit employed Pag-IBIG I member classification is required.');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(contributionMonth || ''))) throw error('invalid_contribution_month', 'Pag-IBIG contribution month must be YYYY-MM.');
  const rule = selectRuleVersion({
    rules: ruleVersions, agency: PAGIBIG_AGENCY, program: PAGIBIG_PROGRAM,
    employeeCoverage: PAGIBIG_COVERAGE, applicableDate: `${contributionMonth}-01T00:00:00.000Z`
  });
  const p = rule.parameters;
  if (p.fundSalaryDefinition !== 'basic_salary_and_other_allowances'
    || p.lowerFundSalaryLimitPHP !== 1500 || p.maximumFundSalaryPHP !== 10000
    || p.employeeRateAtOrBelowLimitBasisPoints !== 100 || p.employeeRateAboveLimitBasisPoints !== 200
    || p.employerRateBasisPoints !== 200 || p.rounding !== 'application-nearest-centavo-half-up; agency rounding confirmation pending') {
    throw error('unsupported_pagibig_rule_parameters', `Pag-IBIG rule ${rule.version} has parameters without a reviewed calculator implementation.`);
  }
  const assessedCents = Math.min(salaryCents, p.maximumFundSalaryPHP * 100);
  const employeeRate = assessedCents <= p.lowerFundSalaryLimitPHP * 100
    ? p.employeeRateAtOrBelowLimitBasisPoints
    : p.employeeRateAboveLimitBasisPoints;
  const employeeCents = percentage(assessedCents, employeeRate);
  const employerCents = percentage(assessedCents, p.employerRateBasisPoints);
  return {
    agency: PAGIBIG_AGENCY,
    contributionMonth,
    ruleVersion: rule.version,
    ruleChecksum: rule.checksum,
    monthlyFundSalaryPHP: php(salaryCents),
    assessedFundSalaryPHP: php(assessedCents),
    employee: { mandatorySavings: php(employeeCents), total: php(employeeCents) },
    employer: { mandatorySavings: php(employerCents), total: php(employerCents) },
    limitations: ['Centavo rounding is a deterministic application convention; obtain agency/payroll review before production activation.', 'Monthly obligation is not prorated for partial employment and is not allocated among pay dates here.']
  };
};

module.exports = {
  PAGIBIG_AGENCY, PAGIBIG_PROGRAM, PAGIBIG_COVERAGE,
  PAGIBIG_CIRCULAR_460_CANDIDATE, calculatePagibigContribution
};
