import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import StoreApplicationSubscriptionChoice, { FALLBACK_STORE_SUBSCRIPTION_PLANS } from './StoreApplicationSubscriptionChoice';

test('shows only paid plans and reports a compact plan preference', () => {
  const onChange = jest.fn();
  render(
    <StoreApplicationSubscriptionChoice
      plans={FALLBACK_STORE_SUBSCRIPTION_PLANS}
      value={{ tier: 'growth', billingInterval: 'monthly', trialAcknowledged: false }}
      onChange={onChange}
    />
  );

  expect(screen.getByText(/30-day Pawzzle Growth trial/i)).toBeVisible();
  expect(screen.getByText(/no charge today/i)).toBeVisible();
  expect(screen.queryByText(/^Free$/i)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Pawzzle Growth/i })).toHaveAttribute('aria-pressed', 'true');

  fireEvent.click(screen.getByRole('button', { name: /choose starter/i }));
  expect(onChange).toHaveBeenCalledWith({ tier: 'starter', billingInterval: 'monthly', trialAcknowledged: false });

  fireEvent.click(screen.getByRole('button', { name: /Annual/i }));
  expect(onChange).toHaveBeenCalledWith({ tier: 'growth', billingInterval: 'annual', trialAcknowledged: false });

  fireEvent.click(screen.getByRole('checkbox', { name: /I understand the trial and payment terms/i }));
  expect(onChange).toHaveBeenCalledWith({ tier: 'growth', billingInterval: 'monthly', trialAcknowledged: true });
});

test('falls back to the current paid catalog and presents validation feedback', () => {
  render(
    <StoreApplicationSubscriptionChoice
      plans={[]}
      value={{ tier: 'growth', billingInterval: 'monthly', trialAcknowledged: false }}
      onChange={jest.fn()}
      error="Confirm that you understand the Growth trial and payment terms."
    />
  );

  expect(screen.getAllByRole('button', { name: /Pawzzle (Starter|Growth|Professional)/i })).toHaveLength(3);
  expect(screen.getByText(/confirm that you understand/i)).toBeVisible();
});
