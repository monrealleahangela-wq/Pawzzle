const { calculateRuleChecksum, selectRuleVersion } = require('./statutoryRuleRegistry');

const BIR_RULE = Object.freeze({
  agency: 'BIR',
  program: 'compensation_withholding_annex_e',
  employeeCoverage: 'private_sector_compensation_employee',
  issuanceId: 'RR 11-2018 Annex E (revised table effective 2023-01-01 and onwards)',
  sourceUrl: 'https://bir-cdn.bir.gov.ph/local/pdf/Annex%20E%20RR%2011-2018.pdf',
  sourceVerifiedOn: new Date('2026-10-14T00:00:00.000Z'),
  effectiveFrom: new Date('2023-01-01T00:00:00.000Z'),
  effectiveThrough: null,
  version: 'bir-rr11-2018-annex-e-2023-onwards-v1',
  verificationStatus: 'verified',
  activationStatus: 'active',
  parameters: Object.freeze({
    rounding: 'nearest-centavo-half-up',
    table: Object.freeze({
      daily: Object.freeze([
        { thresholdPHP: 0, baseTaxPHP: 0, rateBasisPoints: 0 }, { thresholdPHP: 685, baseTaxPHP: 0, rateBasisPoints: 1500 },
        { thresholdPHP: 1096, baseTaxPHP: 61.65, rateBasisPoints: 2000 }, { thresholdPHP: 2192, baseTaxPHP: 280.85, rateBasisPoints: 2500 },
        { thresholdPHP: 5479, baseTaxPHP: 1102.60, rateBasisPoints: 3000 }, { thresholdPHP: 21918, baseTaxPHP: 6034, rateBasisPoints: 3500 }
      ]),
      weekly: Object.freeze([
        { thresholdPHP: 0, baseTaxPHP: 0, rateBasisPoints: 0 }, { thresholdPHP: 4808, baseTaxPHP: 0, rateBasisPoints: 1500 },
        { thresholdPHP: 7692, baseTaxPHP: 432.60, rateBasisPoints: 2000 }, { thresholdPHP: 15385, baseTaxPHP: 1971.20, rateBasisPoints: 2500 },
        { thresholdPHP: 38462, baseTaxPHP: 7740.45, rateBasisPoints: 3000 }, { thresholdPHP: 153846, baseTaxPHP: 42355.65, rateBasisPoints: 3500 }
      ]),
      semi_monthly: Object.freeze([
        { thresholdPHP: 0, baseTaxPHP: 0, rateBasisPoints: 0 }, { thresholdPHP: 10417, baseTaxPHP: 0, rateBasisPoints: 1500 },
        { thresholdPHP: 16667, baseTaxPHP: 937.50, rateBasisPoints: 2000 }, { thresholdPHP: 33333, baseTaxPHP: 4270.70, rateBasisPoints: 2500 },
        { thresholdPHP: 83333, baseTaxPHP: 16770.70, rateBasisPoints: 3000 }, { thresholdPHP: 333333, baseTaxPHP: 91770.70, rateBasisPoints: 3500 }
      ]),
      monthly: Object.freeze([
        { thresholdPHP: 0, baseTaxPHP: 0, rateBasisPoints: 0 }, { thresholdPHP: 20833, baseTaxPHP: 0, rateBasisPoints: 1500 },
        { thresholdPHP: 33333, baseTaxPHP: 1875, rateBasisPoints: 2000 }, { thresholdPHP: 66667, baseTaxPHP: 8541.80, rateBasisPoints: 2500 },
        { thresholdPHP: 166667, baseTaxPHP: 33541.80, rateBasisPoints: 3000 }, { thresholdPHP: 666667, baseTaxPHP: 183541.80, rateBasisPoints: 3500 }
      ])
    })
  })
});
const DEFAULT_RULE = Object.freeze({ ...BIR_RULE, checksum: calculateRuleChecksum(BIR_RULE) });

const error = (code, message) => Object.assign(new Error(message), { code });
const amountToCents = value => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) throw error('invalid_money_amount', 'Compensation and contribution amounts must be non-negative pesos with at most two decimal places.');
    const cents = Math.floor((value + Number.EPSILON) * 100 + 0.5);
    if (!Number.isSafeInteger(cents)) throw error('invalid_money_amount', 'The amount exceeds the supported centavo precision.');
    return cents;
  }
  const text = String(value);
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw error('invalid_money_amount', 'Compensation and contribution amounts must be non-negative pesos with at most two decimal places.');
  const [pesos, fraction = ''] = text.split('.');
  return Number(pesos) * 100 + Number(fraction.padEnd(2, '0'));
};
const centsToPHP = cents => Number((cents / 100).toFixed(2));

const activeOn = (entry, at) => new Date(entry.effectiveFrom) <= at
  && (!entry.effectiveThrough || new Date(entry.effectiveThrough) >= at);

const validateMandatoryContributions = contributions => {
  const required = ['SSS', 'PhilHealth', 'Pag-IBIG'];
  if (!Array.isArray(contributions)) throw error('missing_mandatory_contribution_evidence', 'Provide verified employee-share outcomes for SSS, PhilHealth, and Pag-IBIG; unknown amounts cannot be treated as zero.');
  let totalCents = 0;
  for (const agency of required) {
    const record = contributions.find(item => item.agency === agency);
    if (!record || record.verificationStatus !== 'verified') throw error('missing_mandatory_contribution_evidence', `A verified ${agency} employee-share calculation or documented exemption is required before BIR withholding can be calculated.`);
    if (record.status === 'calculated') {
      if (!record.ruleVersion) throw error('missing_mandatory_contribution_evidence', `The ${agency} amount must identify its verified statutory rule version.`);
      totalCents += amountToCents(record.amountPHP);
    } else if (record.status === 'not_applicable') {
      if (record.amountPHP === undefined || !String(record.reason || '').trim() || !String(record.sourceReference || '').startsWith('https://') || amountToCents(record.amountPHP) !== 0) {
        throw error('missing_mandatory_contribution_evidence', `The ${agency} not-applicable classification requires a verified reason and HTTPS source; no amount may be silently defaulted to zero.`);
      }
    } else {
      throw error('missing_mandatory_contribution_evidence', `The ${agency} employee-share outcome is unresolved.`);
    }
  }
  return totalCents;
};

const taxFromTable = (taxableCents, rows) => {
  const row = rows.reduce((selected, candidate) => candidate.thresholdPHP * 100 <= taxableCents ? candidate : selected, rows[0]);
  const baseCents = amountToCents(row.baseTaxPHP);
  const excessCents = Math.max(0, taxableCents - row.thresholdPHP * 100);
  return baseCents + Math.round(excessCents * row.rateBasisPoints / 10000);
};

const calculateBIRWithholding = ({
  components,
  payrollFrequency,
  taxPeriodDate,
  minimumWageEarnerStatus,
  mandatoryEmployeeContributions,
  rules = [DEFAULT_RULE]
}) => {
  if (!['daily', 'weekly', 'semi_monthly', 'monthly'].includes(payrollFrequency)) throw error('unsupported_payroll_frequency', 'Select daily, weekly, semi-monthly, or monthly payroll frequency.');
  const at = new Date(taxPeriodDate);
  if (!Number.isFinite(at.getTime())) throw error('invalid_tax_period_date', 'Provide a valid compensation payment date for rule selection.');
  const rule = selectRuleVersion({ rules, agency: 'BIR', program: 'compensation_withholding_annex_e', employeeCoverage: 'private_sector_compensation_employee', applicableDate: at });
  if (!Array.isArray(components) || !components.length) throw error('missing_compensation_classification', 'Provide itemized compensation components with verified tax classifications.');
  if (!['verified_yes', 'verified_no'].includes(minimumWageEarnerStatus)) throw error('missing_minimum_wage_classification', 'Minimum-wage-earner status must be explicitly verified; it cannot be inferred from salary.');

  let regularTaxableCents = 0;
  let exemptCents = 0;
  for (const component of components) {
    if (!component.classificationVerified || !component.componentCode || !component.sourceReference
      || !component.effectiveFrom || !activeOn(component, at)
      || !['taxable', 'exempt', 'mwe_exemptible'].includes(component.taxTreatment)
      || !['regular', 'supplementary'].includes(component.compensationType)) {
      throw error('missing_compensation_classification', 'Every compensation item needs an effective, verified tax treatment and source; unknown items cannot be treated as exempt.');
    }
    if (component.compensationType === 'supplementary') throw error('cumulative_withholding_review_required', 'Supplementary compensation requires BIR cumulative/YTD review, which is not implemented in this isolated calculator.');
    const cents = amountToCents(component.amountPHP);
    if (component.taxTreatment === 'exempt' || (component.taxTreatment === 'mwe_exemptible' && minimumWageEarnerStatus === 'verified_yes')) exemptCents += cents;
    else regularTaxableCents += cents;
  }

  const deductionsCents = validateMandatoryContributions(mandatoryEmployeeContributions);
  // Taxable compensation cannot be negative. This is only a tax-base floor;
  // it does not change net pay or convert a negative payable into zero.
  const taxableBaseCents = Math.max(0, regularTaxableCents - deductionsCents);
  const withholdingCents = taxFromTable(taxableBaseCents, rule.parameters.table[payrollFrequency]);
  return {
    agency: 'BIR',
    withholdingPHP: centsToPHP(withholdingCents),
    regularTaxableCompensationPHP: centsToPHP(regularTaxableCents),
    exemptCompensationPHP: centsToPHP(exemptCents),
    verifiedMandatoryEmployeeContributionsPHP: centsToPHP(deductionsCents),
    taxableBasePHP: centsToPHP(taxableBaseCents),
    payrollFrequency,
    ruleVersion: rule.version,
    ruleChecksum: rule.checksum,
    ruleIssuance: rule.issuanceId,
    limitations: ['Supplementary compensation and cumulative/YTD withholding are blocked.', 'This period-table result is not a complete year-end tax reconciliation or filing.']
  };
};

module.exports = { BIR_RULE: DEFAULT_RULE, calculateBIRWithholding, amountToCents };
