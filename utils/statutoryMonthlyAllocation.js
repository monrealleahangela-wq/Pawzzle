const error = (code, message) => Object.assign(new Error(message), { code });

const amountToCents = (amount, label) => {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0
    || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7) {
    throw error('invalid_allocation_amount', `${label} must be a non-negative PHP amount with at most two decimal places.`);
  }
  return Math.round(amount * 100);
};

// No default weekly/semi-monthly split is inferred. The caller must provide
// the Store's explicitly approved, legally reviewed payment-date allocation.
const validateMonthlyContributionAllocations = ({ agency, contributionMonth, obligationPHP, allocations }) => {
  if (!['SSS', 'PhilHealth', 'Pag-IBIG'].includes(agency)) throw error('unsupported_contribution_agency', 'Select SSS, PhilHealth, or Pag-IBIG for monthly contribution reconciliation.');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(contributionMonth || ''))) throw error('invalid_contribution_month', 'Contribution month must be YYYY-MM.');
  const obligationCents = amountToCents(obligationPHP, 'Monthly obligation');
  if (!Array.isArray(allocations) || allocations.length === 0) throw error('missing_allocation_policy', `Configure an authorized payment-date allocation for the ${agency} ${contributionMonth} obligation; no split was assumed.`);
  const seen = new Set();
  let allocatedCents = 0;
  const normalized = allocations.map((allocation, index) => {
    const payrollPeriodId = String(allocation?.payrollPeriodId || '').trim();
    const payDate = new Date(allocation?.payDate);
    if (!payrollPeriodId || !Number.isFinite(payDate.getTime()) || seen.has(payrollPeriodId)) {
      throw error('invalid_allocation_entry', 'Each allocation needs a unique payroll period and valid pay date.');
    }
    seen.add(payrollPeriodId);
    const amountCents = amountToCents(allocation.amountPHP, `Allocation ${index + 1}`);
    allocatedCents += amountCents;
    return { payrollPeriodId, payDate, amountPHP: Number((amountCents / 100).toFixed(2)) };
  });
  if (allocatedCents !== obligationCents) {
    throw error('monthly_obligation_not_reconciled', `Allocations total PHP ${(allocatedCents / 100).toFixed(2)} but the ${agency} ${contributionMonth} monthly obligation is PHP ${(obligationCents / 100).toFixed(2)}.`);
  }
  return {
    agency, contributionMonth, obligationPHP: Number((obligationCents / 100).toFixed(2)),
    allocationStatus: 'explicitly_allocated', allocations: normalized
  };
};

const reconcileMonthlyContributionAllocations = ({ agency, contributionMonth, obligationPHP, finalizedAllocations = [], proposedAllocations = [] }) => {
  const fixed = finalizedAllocations.map(row => ({ ...row, finalized: true }));
  const proposed = proposedAllocations.map(row => ({ ...row, finalized: false }));
  const fixedCents = fixed.reduce((sum, row) => sum + amountToCents(row.amountPHP, 'Finalized allocation'), 0);
  const obligationCents = amountToCents(obligationPHP, 'Monthly obligation');
  if (fixedCents > obligationCents) throw error('finalized_allocation_exceeds_obligation', 'Finalized monthly deductions exceed the current statutory obligation; a new period must not rewrite them. Authorized adjustment review is required.');
  const all = [...fixed, ...proposed];
  const validated = validateMonthlyContributionAllocations({ agency, contributionMonth, obligationPHP, allocations: all });
  return { ...validated, finalizedAllocationCount: fixed.length, proposedAllocationCount: proposed.length, finalizedAmountPHP: Number((fixedCents / 100).toFixed(2)) };
};

module.exports = { validateMonthlyContributionAllocations, reconcileMonthlyContributionAllocations };
