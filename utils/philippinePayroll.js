const roundMoney = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const DEFAULT_PHILIPPINE_PAYROLL_CONFIG = Object.freeze({
  jurisdiction: 'PH',
  version: 'PH-2025-01',
  effectiveFrom: '2025-01-01',
  enabled: true,
  sss: {
    minMsc: 5000,
    maxMsc: 35000,
    mscStep: 500,
    bracketMidpoint: 250,
    employeeRate: 0.05,
    employerRate: 0.10,
    ecThreshold: 14500,
    ecLow: 10,
    ecHigh: 30,
    source: 'SSS Circular 2024-006, effective January 2025'
  },
  philHealth: {
    rate: 0.05,
    salaryFloor: 10000,
    salaryCeiling: 100000,
    employeeShare: 0.5,
    employerShare: 0.5,
    source: 'UHC premium schedule, 2024-2025'
  },
  pagIbig: {
    lowerThreshold: 1500,
    lowerEmployeeRate: 0.01,
    employeeRate: 0.02,
    employerRate: 0.02,
    salaryCeiling: 10000,
    source: 'HDMF Circular 460, effective February 2024'
  },
  withholdingTax: {
    effectiveFrom: '2023-01-01',
    source: 'BIR RR 11-2018 Annex E, effective January 2023 onward',
    tables: {
      weekly: [
        { over: 0, baseTax: 0, rate: 0 },
        { over: 4808, baseTax: 0, rate: 0.15 },
        { over: 7692, baseTax: 432.60, rate: 0.20 },
        { over: 15385, baseTax: 1971.20, rate: 0.25 },
        { over: 38462, baseTax: 7740.45, rate: 0.30 },
        { over: 153846, baseTax: 42355.65, rate: 0.35 }
      ],
      semi_monthly: [
        { over: 0, baseTax: 0, rate: 0 },
        { over: 10417, baseTax: 0, rate: 0.15 },
        { over: 16667, baseTax: 937.50, rate: 0.20 },
        { over: 33333, baseTax: 4270.70, rate: 0.25 },
        { over: 83333, baseTax: 16770.70, rate: 0.30 },
        { over: 333333, baseTax: 91770.70, rate: 0.35 }
      ],
      monthly: [
        { over: 0, baseTax: 0, rate: 0 },
        { over: 20833, baseTax: 0, rate: 0.15 },
        { over: 33333, baseTax: 1875, rate: 0.20 },
        { over: 66667, baseTax: 8541.80, rate: 0.25 },
        { over: 166667, baseTax: 33541.80, rate: 0.30 },
        { over: 666667, baseTax: 183541.80, rate: 0.35 }
      ]
    }
  }
});

const cloneDefaultConfig = () => JSON.parse(JSON.stringify(DEFAULT_PHILIPPINE_PAYROLL_CONFIG));
const finite = (value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw Object.assign(new Error(`${label} must be between ${min} and ${max}.`), { statusCode: 400 });
  }
  return parsed;
};
const mergeConfig = configured => {
  const base = cloneDefaultConfig();
  if (!configured || typeof configured !== 'object') return base;
  return {
    ...base,
    ...configured,
    sss: { ...base.sss, ...(configured.sss || {}) },
    philHealth: { ...base.philHealth, ...(configured.philHealth || {}) },
    pagIbig: { ...base.pagIbig, ...(configured.pagIbig || {}) },
    withholdingTax: {
      ...base.withholdingTax,
      ...(configured.withholdingTax || {}),
      tables: { ...base.withholdingTax.tables, ...(configured.withholdingTax?.tables || {}) }
    }
  };
};

const validateBracketTable = (table, label) => {
  if (!Array.isArray(table) || table.length < 2) throw Object.assign(new Error(`${label} must contain at least two tax brackets.`), { statusCode: 400 });
  let prior = -1;
  return table.map((entry, index) => {
    const over = finite(entry.over, `${label} bracket threshold`);
    const baseTax = finite(entry.baseTax, `${label} base tax`);
    const rate = finite(entry.rate, `${label} rate`, { min: 0, max: 1 });
    if (over <= prior || (index === 0 && over !== 0)) throw Object.assign(new Error(`${label} thresholds must start at zero and increase.`), { statusCode: 400 });
    prior = over;
    return { over, baseTax, rate };
  });
};

const validatePhilippinePayrollConfig = configured => {
  const config = mergeConfig(configured);
  if (config.jurisdiction !== 'PH') throw Object.assign(new Error('Payroll jurisdiction must be PH.'), { statusCode: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(config.effectiveFrom || ''))) throw Object.assign(new Error('A valid statutory configuration effective date is required.'), { statusCode: 400 });
  config.sss.minMsc = finite(config.sss.minMsc, 'SSS minimum MSC', { min: 1 });
  config.sss.maxMsc = finite(config.sss.maxMsc, 'SSS maximum MSC', { min: config.sss.minMsc });
  config.sss.mscStep = finite(config.sss.mscStep, 'SSS MSC step', { min: 1 });
  config.sss.bracketMidpoint = finite(config.sss.bracketMidpoint, 'SSS bracket midpoint', { min: 0, max: config.sss.mscStep });
  config.sss.employeeRate = finite(config.sss.employeeRate, 'SSS employee rate', { max: 1 });
  config.sss.employerRate = finite(config.sss.employerRate, 'SSS employer rate', { max: 1 });
  config.sss.ecThreshold = finite(config.sss.ecThreshold, 'SSS EC threshold');
  config.sss.ecLow = finite(config.sss.ecLow, 'SSS lower EC');
  config.sss.ecHigh = finite(config.sss.ecHigh, 'SSS upper EC');
  config.philHealth.rate = finite(config.philHealth.rate, 'PhilHealth premium rate', { max: 1 });
  config.philHealth.salaryFloor = finite(config.philHealth.salaryFloor, 'PhilHealth salary floor');
  config.philHealth.salaryCeiling = finite(config.philHealth.salaryCeiling, 'PhilHealth salary ceiling', { min: config.philHealth.salaryFloor });
  config.philHealth.employeeShare = finite(config.philHealth.employeeShare, 'PhilHealth employee share', { max: 1 });
  config.philHealth.employerShare = finite(config.philHealth.employerShare, 'PhilHealth employer share', { max: 1 });
  if (Math.abs(config.philHealth.employeeShare + config.philHealth.employerShare - 1) > 0.000001) throw Object.assign(new Error('PhilHealth employee and employer shares must total 100%.'), { statusCode: 400 });
  config.pagIbig.lowerThreshold = finite(config.pagIbig.lowerThreshold, 'Pag-IBIG lower threshold');
  config.pagIbig.lowerEmployeeRate = finite(config.pagIbig.lowerEmployeeRate, 'Pag-IBIG lower employee rate', { max: 1 });
  config.pagIbig.employeeRate = finite(config.pagIbig.employeeRate, 'Pag-IBIG employee rate', { max: 1 });
  config.pagIbig.employerRate = finite(config.pagIbig.employerRate, 'Pag-IBIG employer rate', { max: 1 });
  config.pagIbig.salaryCeiling = finite(config.pagIbig.salaryCeiling, 'Pag-IBIG salary ceiling', { min: 1 });
  for (const frequency of ['weekly', 'semi_monthly', 'monthly']) {
    config.withholdingTax.tables[frequency] = validateBracketTable(config.withholdingTax.tables[frequency], `BIR ${frequency}`);
  }
  config.version = String(config.version || '').trim().slice(0, 80);
  if (!config.version) throw Object.assign(new Error('A statutory configuration version is required.'), { statusCode: 400 });
  return config;
};

const payPeriodsPerMonth = frequency => frequency === 'weekly' ? 52 / 12 : frequency === 'semi_monthly' ? 2 : 1;
const calculateSss = (monthlyCompensation, config) => {
  const salary = Math.max(0, Number(monthlyCompensation || 0));
  const midpoint = Number(config.bracketMidpoint);
  const raw = salary < config.minMsc + midpoint
    ? config.minMsc
    : config.minMsc + (Math.floor((salary - config.minMsc - midpoint) / config.mscStep) + 1) * config.mscStep;
  const msc = Math.min(config.maxMsc, Math.max(config.minMsc, raw));
  const employee = roundMoney(msc * config.employeeRate);
  const employerSocialSecurity = roundMoney(msc * config.employerRate);
  const employerEc = msc <= config.ecThreshold ? config.ecLow : config.ecHigh;
  return {
    basis: salary,
    msc,
    employee,
    employer: roundMoney(employerSocialSecurity + employerEc),
    employerSocialSecurity,
    employerEc,
    source: config.source
  };
};
const calculatePhilHealth = (monthlyCompensation, config) => {
  const salary = Math.max(0, Number(monthlyCompensation || 0));
  const premiumBase = Math.min(config.salaryCeiling, Math.max(config.salaryFloor, salary));
  const totalPremium = roundMoney(premiumBase * config.rate);
  const employee = roundMoney(totalPremium * config.employeeShare);
  const employer = roundMoney(totalPremium - employee);
  return { basis: salary, premiumBase, totalPremium, employee, employer, source: config.source };
};
const calculatePagIbig = (monthlyCompensation, config) => {
  const salary = Math.max(0, Number(monthlyCompensation || 0));
  const contributionBase = Math.min(config.salaryCeiling, salary);
  const employeeRate = salary <= config.lowerThreshold ? config.lowerEmployeeRate : config.employeeRate;
  const employee = roundMoney(contributionBase * employeeRate);
  const employer = roundMoney(contributionBase * config.employerRate);
  return { basis: salary, contributionBase, employeeRate, employee, employer, source: config.source };
};
const calculateWithholdingTax = (taxableCompensation, frequency, config) => {
  const taxable = Math.max(0, Number(taxableCompensation || 0));
  const table = config.tables[frequency];
  if (!table) throw Object.assign(new Error('Unsupported payroll frequency for BIR withholding.'), { statusCode: 400 });
  const bracket = [...table].reverse().find(entry => taxable > entry.over) || table[0];
  const amount = roundMoney(bracket.baseTax + Math.max(0, taxable - bracket.over) * bracket.rate);
  return { taxableCompensation: roundMoney(taxable), threshold: bracket.over, baseTax: bracket.baseTax, rate: bracket.rate, amount, source: config.source };
};

const calculateStatutoryPayroll = ({ grossPay, monthlyCompensation, frequency, configured }) => {
  const config = validatePhilippinePayrollConfig(configured);
  if (config.enabled === false || Number(grossPay || 0) <= 0) return {
    enabled: config.enabled !== false,
    employeeDeductions: { sss: 0, philHealth: 0, pagIbig: 0, withholdingTax: 0, total: 0 },
    employerContributions: { sss: 0, philHealth: 0, pagIbig: 0, total: 0 },
    taxableCompensation: roundMoney(grossPay),
    breakdown: {},
    policy: { jurisdiction: config.jurisdiction, version: config.version, effectiveFrom: config.effectiveFrom }
  };
  const divisor = payPeriodsPerMonth(frequency);
  const allocate = amount => roundMoney(amount / divisor);
  const sssMonthly = calculateSss(monthlyCompensation, config.sss);
  const philHealthMonthly = calculatePhilHealth(monthlyCompensation, config.philHealth);
  const pagIbigMonthly = calculatePagIbig(monthlyCompensation, config.pagIbig);
  const employee = {
    sss: allocate(sssMonthly.employee),
    philHealth: allocate(philHealthMonthly.employee),
    pagIbig: allocate(pagIbigMonthly.employee)
  };
  const taxableCompensation = roundMoney(Math.max(0, Number(grossPay || 0) - employee.sss - employee.philHealth - employee.pagIbig));
  const withholding = calculateWithholdingTax(taxableCompensation, frequency, config.withholdingTax);
  const employeeDeductions = {
    ...employee,
    withholdingTax: withholding.amount,
    total: roundMoney(employee.sss + employee.philHealth + employee.pagIbig + withholding.amount)
  };
  const employerContributions = {
    sss: allocate(sssMonthly.employer),
    philHealth: allocate(philHealthMonthly.employer),
    pagIbig: allocate(pagIbigMonthly.employer)
  };
  employerContributions.total = roundMoney(employerContributions.sss + employerContributions.philHealth + employerContributions.pagIbig);
  return {
    enabled: true,
    employeeDeductions,
    employerContributions,
    taxableCompensation,
    breakdown: {
      allocation: { frequency, payPeriodsPerMonth: divisor },
      sss: { ...sssMonthly, allocatedEmployee: employee.sss, allocatedEmployer: employerContributions.sss },
      philHealth: { ...philHealthMonthly, allocatedEmployee: employee.philHealth, allocatedEmployer: employerContributions.philHealth },
      pagIbig: { ...pagIbigMonthly, allocatedEmployee: employee.pagIbig, allocatedEmployer: employerContributions.pagIbig },
      withholdingTax: withholding
    },
    policy: { jurisdiction: config.jurisdiction, version: config.version, effectiveFrom: config.effectiveFrom }
  };
};

module.exports = {
  DEFAULT_PHILIPPINE_PAYROLL_CONFIG,
  calculatePagIbig,
  calculatePhilHealth,
  calculateSss,
  calculateStatutoryPayroll,
  calculateWithholdingTax,
  cloneDefaultConfig,
  payPeriodsPerMonth,
  roundMoney,
  validatePhilippinePayrollConfig
};
