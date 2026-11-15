import React from 'react';
import { render, screen } from '@testing-library/react';
import { PickupFeePanel } from './Adoptions';

test('shows the customer a server-calculated active care fee breakdown', () => {
  render(<PickupFeePanel request={{ pickupFeeSummary: {
    status: 'accruing',
    accruedCareFee: 200,
    careFeeDays: 2,
    dailyCareFee: 100,
    maximumCareFee: 700,
    possibleNoShowFee: 500,
    coveredByExistingPayment: 200,
    additionalAmountDue: 0,
    contactAttempts: 2,
    minimumContactAttempts: 3,
    graceEndsAt: '2026-10-02T00:00:00.000Z',
    nextCareFeeAt: '2026-10-05T00:00:00.000Z',
    cancellationEligibleAt: '2026-10-08T00:00:00.000Z'
  } }} />);

  expect(screen.getByText('Care fee now accruing')).toBeTruthy();
  expect(screen.getByText('Current care fee')).toBeTruthy();
  expect(screen.getByText('Possible no-show fee if cancelled')).toBeTruthy();
  expect(screen.getByText('Covered by existing payment')).toBeTruthy();
  expect(screen.getByText('Additional amount due now')).toBeTruthy();
  expect(screen.getByText('2/3')).toBeTruthy();
  expect(screen.getByText(/No separate debt is created/)).toBeTruthy();
});

test('shows the final itemized deduction and refund balance', () => {
  render(<PickupFeePanel request={{ pickupFeeSummary: {
    status: 'finalized',
    careFeeDays: 7,
    accruedCareFee: 700,
    noShowFee: 500,
    deductionTotal: 1200,
    refundDue: 3800,
    additionalAmountDue: 0
  } }} />);

  expect(screen.getByText('Final no-show settlement')).toBeTruthy();
  expect(screen.getByText('Deducted from payment')).toBeTruthy();
  expect(screen.getByText('Refundable balance')).toBeTruthy();
  expect(screen.getByText('Additional amount due')).toBeTruthy();
});
