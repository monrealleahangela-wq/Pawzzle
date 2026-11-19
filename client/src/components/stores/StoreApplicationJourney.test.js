import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import StoreApplicationJourney, { storeApplicationStageForStep } from './StoreApplicationJourney';

test('shared journey exposes the same application stages and requirements', () => {
  render(<StoreApplicationJourney activeStage="business" accountComplete applicationOnly />);

  for (const label of ['Business Type', 'Business Info', 'Store Location', 'Documents', 'Document Review', 'Review & Submit']) {
    expect(screen.getByText(label)).toBeInTheDocument();
  }
  expect(screen.getByText(/step 2 of 6/i)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /build a trusted pet business/i })).toHaveClass('!text-white');
  expect(screen.getByText(/pet business/i)).toHaveClass('!text-primary-200');
  expect(storeApplicationStageForStep(4)).toBe('document-review');
});

test('application stages remain navigable from the shared progress header', () => {
  const onStageSelect = jest.fn();
  render(<StoreApplicationJourney activeStage="business" accountComplete applicationOnly onStageSelect={onStageSelect} />);

  fireEvent.click(screen.getByRole('button', { name: /store location/i }));
  expect(onStageSelect).toHaveBeenCalledWith(2);
});
