const { calculateRuleChecksum, selectRuleVersion } = require('./statutoryRuleRegistry');

const SSS_AGENCY = 'SSS';
const SSS_PROGRAM = 'business_employer_contributions';
const SSS_COVERAGE = 'private_sector_employed_member';
const sssCircular2024006 = {
  agency: SSS_AGENCY,
  program: SSS_PROGRAM,
  employeeCoverage: SSS_COVERAGE,
  issuanceId: 'SSS Circular No. 2024-006',
  sourceUrl: 'https://www.sss.gov.ph/wp-content/uploads/2024/12/CI-2024-006-Publication.pdf',
  sourceVerifiedOn: '2026-10-14T00:00:00.000Z',
  effectiveFrom: '2025-01-01T00:00:00.000Z',
  effectiveThrough: null,
  version: 'SSS-2024-006-business-employees-effective-2025-01',
  // The published table rows specify these bands and distinct employee/employer columns.
  parameters: Object.freeze({
    currency: 'PHP',
    contributionPeriod: 'calendar_month',
    compensationBands: 'below-5250-then-500-peso-bands-through-34750-over',
    lowestSalaryCreditPHP: 5000,
    regularSalaryCreditCapPHP: 20000,
    totalSalaryCreditCapPHP: 35000,
    employerRegularSSPerMSC: '0.10',
    employeeRegularSSPerMSC: '0.05',
    employerMPFPerMPFMSC: '0.10',
    employeeMPFPerMPFMSC: '0.05',
    ecPHP: [{ maxCompensationPHP: 14749.99, amountPHP: 10 }, { minCompensationPHP: 14750, amountPHP: 30 }],
    publishedRounding: 'exact amounts from schedule; PHP centavo precision'
  }),
  verificationStatus: 'verified',
  activationStatus: 'active'
};
sssCircular2024006.checksum = calculateRuleChecksum(sssCircular2024006);
const SSS_CIRCULAR_2024_006 = Object.freeze(sssCircular2024006);

const pesosToCentavos = value => Math.round(value * 100);
const centavosToPesos = value => Number((value / 100).toFixed(2));
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };

const contributionRow = monthlyCompensation => {
  const compensationCents = pesosToCentavos(monthlyCompensation);
  // These are the exact compensation band edges printed in Circular 2024-006.
  // Below PHP 5,250 uses MSC PHP 5,000; subsequent bands advance by PHP 500,
  // with the final PHP 34,750-and-over band capped at total MSC PHP 35,000.
  const firstBoundaryCents = 525000;
  const bandIndex = compensationCents < firstBoundaryCents
    ? 0
    : Math.floor((compensationCents - firstBoundaryCents) / 50000) + 1;
  const totalMSC = Math.min(5000 + (bandIndex * 500), 35000);
  const regularMSC = Math.min(totalMSC, 20000);
  const mpfMSC = Math.max(totalMSC - regularMSC, 0);
  const ec = totalMSC <= 14500 ? 10 : 30;
  const employeeRegular = regularMSC * 0.05;
  const employerRegular = regularMSC * 0.10;
  const employeeMPF = mpfMSC * 0.05;
  const employerMPF = mpfMSC * 0.10;
  // Every published contribution is an exact multiple of PHP 0.25 / PHP 1;
  // the selected MSC steps ensure all result amounts are centavo-exact.
  return {
    compensationBandIndex: bandIndex,
    monthlySalaryCredit: totalMSC,
    regularSalaryCredit: regularMSC,
    mpfSalaryCredit: mpfMSC,
    employee: {
      regularSS: centavosToPesos(pesosToCentavos(employeeRegular)),
      mpf: centavosToPesos(pesosToCentavos(employeeMPF)),
      ec: 0
    },
    employer: {
      regularSS: centavosToPesos(pesosToCentavos(employerRegular)),
      mpf: centavosToPesos(pesosToCentavos(employerMPF)),
      ec
    }
  };
};

const calculateSSSContribution = ({
  monthlyCompensation,
  employeeClassification,
  contributionMonth,
  ruleVersions
}) => {
  if (!Number.isFinite(monthlyCompensation) || monthlyCompensation <= 0
    || Math.abs((monthlyCompensation * 100) - pesosToCentavos(monthlyCompensation)) > 1e-7) {
    fail('invalid_monthly_compensation', 'Monthly SSS-assessable compensation must be a finite, positive PHP amount with no more than two decimal places; zero-pay months require separate coverage review.');
  }
  if (employeeClassification !== SSS_COVERAGE) {
    fail('missing_or_unsupported_employee_classification', 'An explicit private-sector employed-member coverage classification is required for SSS calculation.');
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(contributionMonth || ''))) {
    fail('invalid_contribution_month', 'SSS contribution month must be provided as YYYY-MM.');
  }
  const applicableDate = `${contributionMonth}-01T00:00:00.000Z`;
  const rule = selectRuleVersion({
    rules: ruleVersions,
    agency: SSS_AGENCY,
    program: SSS_PROGRAM,
    employeeCoverage: SSS_COVERAGE,
    applicableDate
  });
  if (rule.version !== SSS_CIRCULAR_2024_006.version || rule.checksum !== SSS_CIRCULAR_2024_006.checksum) {
    fail('unsupported_sss_rule_version', `SSS rule ${rule.version} is validly registered but has no reviewed calculation implementation.`);
  }
  const row = contributionRow(monthlyCompensation);
  return {
    agency: SSS_AGENCY,
    contributionMonth,
    ruleVersion: rule.version,
    ruleChecksum: rule.checksum,
    monthlySalaryCredit: row.monthlySalaryCredit,
    regularSalaryCredit: row.regularSalaryCredit,
    mpfSalaryCredit: row.mpfSalaryCredit,
    employee: { ...row.employee, total: centavosToPesos(pesosToCentavos(row.employee.regularSS + row.employee.mpf)) },
    employer: { ...row.employer, total: centavosToPesos(pesosToCentavos(row.employer.regularSS + row.employer.mpf + row.employer.ec)) }
  };
};

module.exports = {
  SSS_AGENCY,
  SSS_PROGRAM,
  SSS_COVERAGE,
  SSS_CIRCULAR_2024_006,
  calculateSSSContribution,
  contributionRow
};
