const assert = require('node:assert/strict');
const test = require('node:test');
const { validateMonthlyContributionAllocations, reconcileMonthlyContributionAllocations } = require('../utils/statutoryMonthlyAllocation');

test('monthly obligation requires explicit policy allocations and exact centavo reconciliation', () => {
  assert.throws(() => validateMonthlyContributionAllocations({ agency: 'SSS', contributionMonth: '2026-01', obligationPHP: 500, allocations: [] }), error => error.code === 'missing_allocation_policy');
  const result = validateMonthlyContributionAllocations({
    agency: 'SSS', contributionMonth: '2026-01', obligationPHP: 500,
    allocations: [
      { payrollPeriodId: 'p1', payDate: '2026-01-15', amountPHP: 100 },
      { payrollPeriodId: 'p2', payDate: '2026-01-31', amountPHP: 200 },
      { payrollPeriodId: 'p3', payDate: '2026-02-07', amountPHP: 200 }
    ]
  });
  assert.equal(result.allocationStatus, 'explicitly_allocated');
  assert.equal(result.allocations.length, 3);
  assert.throws(() => validateMonthlyContributionAllocations({
    agency: 'PhilHealth', contributionMonth: '2026-01', obligationPHP: 500,
    allocations: [{ payrollPeriodId: 'p1', payDate: '2026-01-15', amountPHP: 250 }]
  }), error => error.code === 'monthly_obligation_not_reconciled');
});

test('reconciliation preserves finalized allocations and refuses to mutate them implicitly', () => {
  const result = reconcileMonthlyContributionAllocations({
    agency: 'Pag-IBIG', contributionMonth: '2026-05', obligationPHP: 400,
    finalizedAllocations: [{ payrollPeriodId: 'final', payDate: '2026-05-15', amountPHP: 200 }],
    proposedAllocations: [{ payrollPeriodId: 'next', payDate: '2026-05-31', amountPHP: 200 }]
  });
  assert.equal(result.finalizedAllocationCount, 1);
  assert.equal(result.finalizedAmountPHP, 200);
  assert.throws(() => reconcileMonthlyContributionAllocations({
    agency: 'Pag-IBIG', contributionMonth: '2026-05', obligationPHP: 150,
    finalizedAllocations: [{ payrollPeriodId: 'final', payDate: '2026-05-15', amountPHP: 200 }]
  }), error => error.code === 'finalized_allocation_exceeds_obligation');
});

