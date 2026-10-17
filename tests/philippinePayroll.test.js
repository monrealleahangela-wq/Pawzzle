const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateSss, calculatePhilHealth, calculatePagIbig,
  calculateWithholdingTax, calculateStatutoryPayroll,
  validatePhilippinePayrollConfig
} = require('../utils/philippinePayroll');

const config = validatePhilippinePayrollConfig();

test('SSS uses the official MSC bands and separates employee, employer, and EC shares', () => {
  assert.deepEqual(calculateSss(5249.99, config.sss), {
    basis: 5249.99, msc: 5000, employee: 250, employer: 510,
    employerSocialSecurity: 500, employerEc: 10, source: config.sss.source
  });
  const boundary = calculateSss(5250, config.sss);
  assert.equal(boundary.msc, 5500);
  assert.equal(boundary.employee, 275);
  assert.equal(boundary.employer, 560);
  const capped = calculateSss(100000, config.sss);
  assert.equal(capped.msc, 35000);
  assert.equal(capped.employee, 1750);
  assert.equal(capped.employer, 3530);
});

test('PhilHealth applies the official floor, ceiling and equal employee/employer split', () => {
  assert.deepEqual(calculatePhilHealth(8000, config.philHealth), {
    basis: 8000, premiumBase: 10000, totalPremium: 500, employee: 250, employer: 250, source: config.philHealth.source
  });
  const capped = calculatePhilHealth(120000, config.philHealth);
  assert.equal(capped.totalPremium, 5000);
  assert.equal(capped.employee, 2500);
  assert.equal(capped.employer, 2500);
});

test('Pag-IBIG applies compensation brackets and the maximum fund salary', () => {
  assert.equal(calculatePagIbig(1500, config.pagIbig).employee, 15);
  const upper = calculatePagIbig(50000, config.pagIbig);
  assert.equal(upper.contributionBase, 10000);
  assert.equal(upper.employee, 200);
  assert.equal(upper.employer, 200);
});

test('BIR withholding uses the configured payroll-period bracket rather than a flat percentage', () => {
  assert.equal(calculateWithholdingTax(10000, 'semi_monthly', config.withholdingTax).amount, 0);
  assert.equal(calculateWithholdingTax(20000, 'semi_monthly', config.withholdingTax).amount, 1604.1);
  assert.equal(calculateWithholdingTax(40000, 'monthly', config.withholdingTax).amount, 3208.4);
});

test('itemized statutory payroll keeps employee deductions separate from employer contributions', () => {
  const result = calculateStatutoryPayroll({ grossPay: 25000, monthlyCompensation: 50000, frequency: 'semi_monthly' });
  assert.deepEqual(result.employeeDeductions, { sss: 875, philHealth: 625, pagIbig: 100, withholdingTax: 2284.1, total: 3884.1 });
  assert.deepEqual(result.employerContributions, { sss: 1765, philHealth: 625, pagIbig: 100, total: 2490 });
  assert.equal(result.taxableCompensation, 23400);
  assert.equal(result.policy.version, 'PH-2025-01');
});

test('invalid configurable schedules fail before payroll can be calculated', () => {
  assert.throws(() => validatePhilippinePayrollConfig({ philHealth: { rate: 2 } }), /premium rate/);
  assert.throws(() => validatePhilippinePayrollConfig({ withholdingTax: { tables: { monthly: [{ over: 1, baseTax: 0, rate: 0 }] } } }), /at least two/);
});
