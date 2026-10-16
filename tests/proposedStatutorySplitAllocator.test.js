const assert = require('node:assert/strict');
const test = require('node:test');
const { allocateProposedMonthlyEmployeeShare } = require('../utils/proposedStatutorySplitAllocator');

const paycheck = (id, payDate, deductibleCapacityCents = 100000) => ({
  id,
  periodStart: `${payDate.slice(0, 7)}-01`,
  periodEnd: `${payDate.slice(0, 7)}-15`,
  payDate,
  eligible: true,
  deductibleCapacityCents
});

test('splits a four-paycheck monthly obligation exactly and assigns residual centavos by stable chronology', () => {
  const result = allocateProposedMonthlyEmployeeShare({
    obligationCents: 20001,
    eligiblePaychecks: [paycheck('p4', '2026-01-28'), paycheck('p2', '2026-01-14'), paycheck('p1', '2026-01-07'), paycheck('p3', '2026-01-21')]
  });
  assert.deepEqual(result.proposedAllocations.map(row => [row.payrollPeriodId, row.amountCents]), [
    ['p1', 5001], ['p2', 5000], ['p3', 5000], ['p4', 5000]
  ]);
  assert.equal(result.allocatedCents, 20001);
  assert.equal(result.status, 'proposal_only');
});

test('supports a five-paycheck month with deterministic one-cent residual distribution', () => {
  const result = allocateProposedMonthlyEmployeeShare({
    obligationCents: 10003,
    eligiblePaychecks: ['01', '08', '15', '22', '29'].map((day, index) => paycheck(`p${index + 1}`, `2026-04-${day}`))
  });
  assert.deepEqual(result.proposedAllocations.map(row => row.amountCents), [2001, 2001, 2001, 2000, 2000]);
  assert.equal(result.allocatedCents, 10003);
});

test('does not infer contribution-month eligibility from cross-month dates', () => {
  const crossMonth = paycheck('cross', '2026-02-05');
  crossMonth.periodStart = '2026-01-16';
  crossMonth.periodEnd = '2026-01-31';
  crossMonth.eligible = false;
  assert.throws(() => allocateProposedMonthlyEmployeeShare({ obligationCents: 100, eligiblePaychecks: [crossMonth] }), error => error.code === 'paycheck_not_confirmed_eligible');
  crossMonth.eligible = true;
  const proposed = allocateProposedMonthlyEmployeeShare({ obligationCents: 100, eligiblePaychecks: [crossMonth] });
  assert.equal(proposed.proposedAllocations[0].payDate, '2026-02-05T00:00:00.000Z');
});

test('rejects duplicate periods and insufficient available earnings without partial allocation', () => {
  assert.throws(() => allocateProposedMonthlyEmployeeShare({ obligationCents: 100, eligiblePaychecks: [paycheck('dup', '2026-01-10'), paycheck('dup', '2026-01-20')] }), error => error.code === 'duplicate_or_missing_period');
  assert.throws(() => allocateProposedMonthlyEmployeeShare({ obligationCents: 101, eligiblePaychecks: [paycheck('small', '2026-01-10', 50), paycheck('ok', '2026-01-20', 100)] }), error => error.code === 'insufficient_earnings');
});

test('preserves finalized allocation and applies only the outstanding balance to remaining paychecks', () => {
  const result = allocateProposedMonthlyEmployeeShare({
    obligationCents: 20001,
    finalizedAllocations: [{ payrollPeriodId: 'done', payDate: '2026-03-10', periodStart: '2026-03-01', periodEnd: '2026-03-07', amountCents: 5001 }],
    eligiblePaychecks: [paycheck('next2', '2026-03-24'), paycheck('next1', '2026-03-17')]
  });
  assert.equal(result.finalizedAllocations[0].amountCents, 5001);
  assert.deepEqual(result.proposedAllocations.map(row => [row.payrollPeriodId, row.amountCents]), [['next1', 7500], ['next2', 7500]]);
  assert.equal(result.allocatedCents, 20001);
});

