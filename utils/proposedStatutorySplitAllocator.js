const fail = (code, message) => Object.assign(new Error(message), { code });

const isCents = value => Number.isSafeInteger(value) && value >= 0;

const validDate = (value, label) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw fail('invalid_payroll_period', `${label} must be a valid date.`);
  return date;
};

const comparePeriods = (left, right) => left.payDate - right.payDate
  || left.periodStart - right.periodStart
  || left.id.localeCompare(right.id);

/**
 * Pure proposal only. Eligibility must be determined by an approved, agency- and
 * Store-specific contribution-month policy before calling this function. This
 * helper deliberately does not infer eligibility from period or pay dates.
 */
const allocateProposedMonthlyEmployeeShare = ({
  obligationCents,
  eligiblePaychecks,
  finalizedAllocations = []
}) => {
  if (!isCents(obligationCents)) throw fail('invalid_obligation', 'Monthly employee obligation must be a non-negative integer number of centavos.');
  if (!Array.isArray(eligiblePaychecks) || eligiblePaychecks.length === 0) {
    throw fail('no_eligible_paychecks', 'No policy-eligible paychecks were supplied for this monthly obligation.');
  }
  if (!Array.isArray(finalizedAllocations)) throw fail('invalid_finalized_allocations', 'Finalized allocations must be a list.');

  const seen = new Set();
  const normalize = (row, isFinalized) => {
    const id = String(row?.id ?? row?.payrollPeriodId ?? '').trim();
    if (!id || seen.has(id)) throw fail('duplicate_or_missing_period', 'Every payroll period must have a unique, non-empty identifier.');
    seen.add(id);
    const periodStart = validDate(row.periodStart, `Payroll period ${id} start`);
    const periodEnd = validDate(row.periodEnd, `Payroll period ${id} end`);
    const payDate = validDate(row.payDate, `Payroll period ${id} pay date`);
    if (periodEnd < periodStart) throw fail('invalid_payroll_period', `Payroll period ${id} ends before it starts.`);
    return {
      id, periodStart, periodEnd, payDate,
      deductibleCapacityCents: row.deductibleCapacityCents,
      amountCents: isFinalized ? row.amountCents : undefined,
      finalized: isFinalized
    };
  };

  const fixed = finalizedAllocations.map(row => {
    const normalized = normalize(row, true);
    if (!isCents(normalized.amountCents)) throw fail('invalid_finalized_allocation', `Finalized allocation for ${normalized.id} must be integer centavos.`);
    return normalized;
  });
  const fixedCents = fixed.reduce((sum, row) => sum + row.amountCents, 0);
  if (!Number.isSafeInteger(fixedCents) || fixedCents > obligationCents) {
    throw fail('finalized_exceeds_obligation', 'Immutable finalized deductions exceed the current obligation; block for authorized adjustment review.');
  }

  const candidates = eligiblePaychecks.map(row => {
    if (row?.eligible !== true) throw fail('paycheck_not_confirmed_eligible', 'Every proposed paycheck must be explicitly confirmed eligible by the approved contribution-month policy.');
    const normalized = normalize(row, false);
    if (!isCents(normalized.deductibleCapacityCents)) {
      throw fail('insufficient_earnings', `Payroll period ${normalized.id} has no validated non-negative deductible capacity in centavos.`);
    }
    return normalized;
  }).sort(comparePeriods);

  const remaining = obligationCents - fixedCents;
  if (remaining > 0 && candidates.length === 0) throw fail('no_remaining_paychecks', 'The obligation has a remaining balance but no unfinalized eligible paycheck.');
  const quotient = candidates.length ? Math.floor(remaining / candidates.length) : 0;
  const residual = candidates.length ? remaining % candidates.length : 0;
  const proposed = candidates.map((row, index) => {
    const amountCents = quotient + (index < residual ? 1 : 0);
    if (amountCents > row.deductibleCapacityCents) {
      throw fail('insufficient_earnings', `Payroll period ${row.id} cannot cover its proposed ${amountCents} centavo deduction within validated available earnings (${row.deductibleCapacityCents} centavos).`);
    }
    return { payrollPeriodId: row.id, payDate: row.payDate.toISOString(), amountCents, finalized: false };
  });

  const allocatedCents = fixedCents + proposed.reduce((sum, row) => sum + row.amountCents, 0);
  if (allocatedCents !== obligationCents) throw fail('allocation_mismatch', 'Proposed allocations do not reconcile exactly to the monthly employee obligation.');
  return {
    status: 'proposal_only',
    obligationCents,
    finalizedAllocations: fixed.map(row => ({ payrollPeriodId: row.id, payDate: row.payDate.toISOString(), amountCents: row.amountCents, finalized: true })),
    proposedAllocations: proposed,
    allocatedCents
  };
};

module.exports = { allocateProposedMonthlyEmployeeShare };
