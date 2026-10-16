const assert = require('node:assert/strict');
const test = require('node:test');
const {
  SSS_CIRCULAR_2024_006,
  SSS_COVERAGE,
  SSS_PROGRAM,
  calculateSSSContribution
} = require('../utils/sssContribution');
const {
  calculateRuleChecksum,
  selectRuleVersion,
  validateActiveRuleSet,
  validateRuleIntegrity
} = require('../utils/statutoryRuleRegistry');
const StatutoryRuleVersion = require('../models/StatutoryRuleVersion');

const signedRule = overrides => {
  const rule = {
    ...SSS_CIRCULAR_2024_006,
    parameters: { ...SSS_CIRCULAR_2024_006.parameters },
    verificationStatus: 'verified',
    activationStatus: 'active',
    ...overrides
  };
  rule.checksum = calculateRuleChecksum(rule);
  return rule;
};
const currentRule = signedRule({});
const calc = (monthlyCompensation, contributionMonth = '2026-01', ruleVersions = [currentRule], employeeClassification = SSS_COVERAGE) => calculateSSSContribution({
  monthlyCompensation,
  employeeClassification,
  contributionMonth,
  ruleVersions
});

test('SSS table lower and first bracket boundaries return exact published contribution rows', () => {
  assert.deepEqual(calc(1), {
    agency: 'SSS', contributionMonth: '2026-01', ruleVersion: currentRule.version,
    ruleChecksum: currentRule.checksum, monthlySalaryCredit: 5000, regularSalaryCredit: 5000, mpfSalaryCredit: 0,
    employee: { regularSS: 250, mpf: 0, ec: 0, total: 250 },
    employer: { regularSS: 500, mpf: 0, ec: 10, total: 510 }
  });
  assert.equal(calc(5249.99).monthlySalaryCredit, 5000);
  assert.deepEqual(calc(5250).employee, { regularSS: 275, mpf: 0, ec: 0, total: 275 });
  assert.deepEqual(calc(5250).employer, { regularSS: 550, mpf: 0, ec: 10, total: 560 });
  assert.equal(calc(5749.99).monthlySalaryCredit, 5500);
  assert.equal(calc(5750).monthlySalaryCredit, 6000);
});

test('SSS regular-to-MPF, EC, and maximum salary credit boundaries match Circular 2024-006 table', () => {
  assert.deepEqual(calc(14749.99).employer, { regularSS: 1450, mpf: 0, ec: 10, total: 1460 });
  assert.deepEqual(calc(14750).employer, { regularSS: 1500, mpf: 0, ec: 30, total: 1530 });
  assert.deepEqual(calc(14750).employee, { regularSS: 750, mpf: 0, ec: 0, total: 750 });
  assert.deepEqual(calc(24750).employee, { regularSS: 1000, mpf: 250, ec: 0, total: 1250 });
  assert.deepEqual(calc(24750).employer, { regularSS: 2000, mpf: 500, ec: 30, total: 2530 });
  assert.deepEqual(calc(34749.99).employee, { regularSS: 1000, mpf: 725, ec: 0, total: 1725 });
  assert.deepEqual(calc(34750).employee, { regularSS: 1000, mpf: 750, ec: 0, total: 1750 });
  assert.deepEqual(calc(34750).employer, { regularSS: 2000, mpf: 1500, ec: 30, total: 3530 });
  assert.equal(calc(999999).monthlySalaryCredit, 35000);
});

test('every 500-peso compensation-table transition selects the published MSC and shares', () => {
  for (let band = 0; band < 60; band += 1) {
    const edge = 5250 + (band * 500);
    const priorMSC = 5000 + (band * 500);
    const nextMSC = Math.min(priorMSC + 500, 35000);
    const below = calc(Number((edge - 0.01).toFixed(2)));
    const at = calc(edge);
    assert.equal(below.monthlySalaryCredit, priorMSC, `prior MSC immediately below PHP ${edge}`);
    assert.equal(at.monthlySalaryCredit, nextMSC, `MSC at PHP ${edge}`);
    const regularMSC = Math.min(nextMSC, 20000);
    const mpfMSC = Math.max(nextMSC - regularMSC, 0);
    const ec = nextMSC <= 14500 ? 10 : 30;
    assert.deepEqual(at.employee, { regularSS: regularMSC * 0.05, mpf: mpfMSC * 0.05, ec: 0, total: regularMSC * 0.05 + mpfMSC * 0.05 });
    assert.deepEqual(at.employer, { regularSS: regularMSC * 0.1, mpf: mpfMSC * 0.1, ec, total: regularMSC * 0.1 + mpfMSC * 0.1 + ec });
  }
});

test('SSS selects only exact active verified effective-dated rule and has no fallback', () => {
  assert.equal(calc(20000, '2025-01').ruleVersion, currentRule.version);
  assert.throws(() => calc(20000, '2024-12'), error => error.code === 'verified_rule_missing');
  assert.throws(() => calc(20000, '2026-01', []), error => error.code === 'verified_rule_missing');
  const inactive = signedRule({ activationStatus: 'inactive' });
  assert.throws(() => calc(20000, '2026-01', [inactive]), error => error.code === 'verified_rule_missing');
  assert.throws(() => selectRuleVersion({ rules: [signedRule({ verificationStatus: 'unverified' })], agency: 'SSS', program: SSS_PROGRAM, employeeCoverage: SSS_COVERAGE, applicableDate: '2026-01-01' }), error => error.code === 'verified_rule_missing');
});

test('rule selection observes effective-through edges and the next exact version', () => {
  const oldRule = signedRule({ version: 'old', effectiveThrough: '2025-12-31T23:59:59.999Z' });
  const nextRule = signedRule({ version: 'next', effectiveFrom: '2026-01-01T00:00:00.000Z' });
  const shared = { agency: 'SSS', program: SSS_PROGRAM, employeeCoverage: SSS_COVERAGE, rules: [oldRule, nextRule] };
  assert.equal(selectRuleVersion({ ...shared, applicableDate: '2025-12-31T12:00:00.000Z' }).version, 'old');
  assert.equal(selectRuleVersion({ ...shared, applicableDate: '2026-01-01T00:00:00.000Z' }).version, 'next');
  assert.throws(() => selectRuleVersion({ ...shared, applicableDate: '2024-12-31T00:00:00.000Z' }), error => error.code === 'verified_rule_missing');
});

test('rule checksum detects mutation and contradictory active ranges are rejected', () => {
  assert.equal(validateRuleIntegrity(currentRule), true);
  assert.throws(() => validateRuleIntegrity({ ...currentRule, parameters: { ...currentRule.parameters, totalSalaryCreditCapPHP: 50000 } }), error => error.code === 'rule_integrity_mismatch');
  const successor = signedRule({ version: 'overlap', effectiveFrom: '2025-06-01T00:00:00.000Z' });
  assert.throws(() => validateActiveRuleSet([currentRule, successor]), error => error.code === 'overlapping_active_rules');
});

test('persisted rule registry includes provenance, coverage, date range, verification and activation fields', () => {
  for (const field of ['agency', 'program', 'employeeCoverage', 'issuanceId', 'sourceUrl', 'sourceVerifiedOn', 'effectiveFrom', 'effectiveThrough', 'parameters', 'version', 'checksum', 'verificationStatus', 'activationStatus', 'activatedAt', 'activatedBy']) {
    assert.ok(StatutoryRuleVersion.schema.path(field), `missing statutory rule field ${field}`);
  }
  assert.equal(StatutoryRuleVersion.schema.path('agency').enumValues.length, 4);
});

test('SSS rejects unsupported employee class, invalid compensation, and missing contribution month', () => {
  assert.throws(() => calculateSSSContribution({ monthlyCompensation: 1000, contributionMonth: '2026-01', ruleVersions: [currentRule] }), error => error.code === 'missing_or_unsupported_employee_classification');
  assert.throws(() => calc(-1), error => error.code === 'invalid_monthly_compensation');
  assert.throws(() => calc(0), error => error.code === 'invalid_monthly_compensation');
  assert.throws(() => calc(1.005), error => error.code === 'invalid_monthly_compensation');
  assert.throws(() => calc(1000, '2026-00'), error => error.code === 'invalid_contribution_month');
});

