import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import StoreApplicationJourney, { storeApplicationStageForStep } from './StoreApplicationJourney';

test('shared journey exposes the same application stages and requirements', () => {
  render(<StoreApplicationJourney activeStage="business" accountComplete />);

  for (const label of ['Account', 'Verify', 'Overview', 'Business', 'Owner & Team', 'Location & Tax', 'Documents', 'Review']) {
    expect(screen.getByText(label)).toBeInTheDocument();
  }
  for (const requirement of ['Verified Pawzzle account', 'DTI or SEC registration', 'Confirmed store map location', 'BIR details when registered', 'Two business references']) {
    expect(screen.getByText(requirement)).toBeInTheDocument();
  }
  expect(storeApplicationStageForStep(4)).toBe('documents');
});

test('application stages remain navigable from the shared progress header', () => {
  const onStageSelect = jest.fn();
  render(<StoreApplicationJourney activeStage="business" accountComplete onStageSelect={onStageSelect} />);

  fireEvent.click(screen.getByRole('button', { name: /location & tax/i }));
  expect(onStageSelect).toHaveBeenCalledWith(3);
});
