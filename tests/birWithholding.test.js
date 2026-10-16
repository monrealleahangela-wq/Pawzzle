const assert = require('node:assert/strict');
const test = require('node:test');
const { BIR_RULE, calculateBIRWithholding, amountToCents } = require('../utils/birWithholding');

const mandatory = [
  { agency: 'SSS', status: 'calculated', amountPHP: 250, ruleVersion: 'sss-v1', verificationStatus: 'verified' },
  { agency: 'PhilHealth', status: 'not_applicable', amountPHP: 0, reason: 'Verified classification shows exempt coverage.', sourceReference: 'https://www.philhealth.gov.ph/official-rule', verificationStatus: 'verified' },
  { agency: 'Pag-IBIG', status: 'calculated', amountPHP: 100, ruleVersion: 'hdmf-v1', verificationStatus: 'verified' }
];
const component = (amountPHP, overrides = {}) => ({
  componentCode: 'basic_salary', amountPHP, compensationType: 'regular', taxTreatment: 'taxable',
  effectiveFrom: '2023-01-01', classificationVerified: true, sourceReference: 'https://bir.gov.ph/verified-classification', ...overrides
});
const calc = (amountPHP, payrollFrequency = 'monthly', options = {}) => calculateBIRWithholding({
  components: [component(amountPHP)], payrollFrequency, taxPeriodDate: '2026-10-14',
  minimumWageEarnerStatus: 'verified_no', mandatoryEmployeeContributions: mandatory, ...options
});

test('BIR Annex E is versioned, checksum-valid, and effective from 2023 onwards', () => {
  assert.equal(BIR_RULE.issuanceId.includes('RR 11-2018'), true);
  assert.equal(BIR_RULE.effectiveFrom.toISOString().slice(0, 10), '2023-01-01');
  assert.equal(BIR_RULE.effectiveThrough, null);
  assert.match(BIR_RULE.checksum, /^[a-f0-9]{64}$/);
});

test('peso amounts convert to integer centavos without binary half-cent loss', () => {
  assert.equal(amountToCents(1.005), 101);
  assert.equal(amountToCents('1.05'), 105);
  assert.throws(() => amountToCents('1.005'), error => error.code === 'invalid_money_amount');
});

test('daily, weekly, semi-monthly, and monthly Annex E table boundaries calculate using centavo arithmetic', () => {
  const cases = [
    ['daily', 1445, 350, 61.50], ['weekly', 8041, 350, 432.45],
    ['semi_monthly', 17016, 350, 937.35], ['monthly', 33682, 350, 1874.85]
  ];
  for (const [frequency, gross, deduction, expected] of cases) {
    const result = calc(gross, frequency, { mandatoryEmployeeContributions: mandatory });
    assert.equal(result.verifiedMandatoryEmployeeContributionsPHP, deduction, frequency);
    assert.equal(result.withholdingPHP, expected, frequency);
  }
  assert.equal(calc(21833, 'monthly').taxableBasePHP, 21483);
  assert.equal(calc(21833, 'monthly').withholdingPHP, 97.50);
});

test('each published Annex E threshold and its immediately preceding centavo use the exact table row', () => {
  const noDeductions = ['SSS', 'PhilHealth', 'Pag-IBIG'].map(agency => ({ agency, status: 'calculated', amountPHP: 0, ruleVersion: `${agency}-verified`, verificationStatus: 'verified' }));
  for (const [frequency, rows] of Object.entries(BIR_RULE.parameters.table)) {
    for (let index = 1; index < rows.length; index += 1) {
      const row = rows[index];
      const belowPHP = Number((row.thresholdPHP - 0.01).toFixed(2));
      const belowExpected = Number((rows[index - 1].baseTaxPHP + Math.round((belowPHP - rows[index - 1].thresholdPHP) * 100 * rows[index - 1].rateBasisPoints / 10000) / 100).toFixed(2));
      assert.equal(calc(belowPHP, frequency, { mandatoryEmployeeContributions: noDeductions }).withholdingPHP, belowExpected, `${frequency} below ${row.thresholdPHP}`);
      assert.equal(calc(row.thresholdPHP, frequency, { mandatoryEmployeeContributions: noDeductions }).withholdingPHP, row.baseTaxPHP, `${frequency} at ${row.thresholdPHP}`);
    }
  }
});

test('taxable and explicitly exempt items are separated; MWE treatment needs verified status', () => {
  const result = calc(22000, 'monthly', { components: [
    component(21000), component(1000, { componentCode: 'verified_uniform_allowance', taxTreatment: 'exempt' })
  ] });
  assert.equal(result.regularTaxableCompensationPHP, 21000);
  assert.equal(result.exemptCompensationPHP, 1000);
  assert.throws(() => calc(22000, 'monthly', { minimumWageEarnerStatus: 'unknown' }), error => error.code === 'missing_minimum_wage_classification');
  assert.equal(calc(22000, 'monthly', { components: [component(22000, { taxTreatment: 'mwe_exemptible' })], minimumWageEarnerStatus: 'verified_yes' }).taxableBasePHP, 0);
  assert.equal(calc(22000, 'monthly', { components: [component(22000, { taxTreatment: 'mwe_exemptible' })], minimumWageEarnerStatus: 'verified_no' }).taxableBasePHP, 21650);
});

test('unknown contributions, classifications, unsupported dates, and supplementary/YTD cases fail closed', () => {
  assert.throws(() => calc(50000, 'monthly', { mandatoryEmployeeContributions: [] }), error => error.code === 'missing_mandatory_contribution_evidence');
  assert.throws(() => calc(50000, 'monthly', { mandatoryEmployeeContributions: mandatory.map(record => record.agency === 'PhilHealth' ? { ...record, amountPHP: undefined } : record) }), error => error.code === 'missing_mandatory_contribution_evidence');
  assert.throws(() => calc(50000, 'monthly', { components: [component(50000, { classificationVerified: false })] }), error => error.code === 'missing_compensation_classification');
  assert.throws(() => calc(50000, 'monthly', { components: [component(50000, { taxTreatment: 'unknown' })] }), error => error.code === 'missing_compensation_classification');
  assert.throws(() => calc(50000, 'monthly', { components: [component(50000, { compensationType: 'supplementary' })] }), error => error.code === 'cumulative_withholding_review_required');
  assert.throws(() => calc(50000, 'monthly', { rules: [] }), error => error.code === 'verified_rule_missing');
  assert.throws(() => calc(50000, 'monthly', { taxPeriodDate: '2022-12-31' }), error => error.code === 'verified_rule_missing');
  assert.throws(() => calc(50000, 'biweekly'), error => error.code === 'unsupported_payroll_frequency');
});
