import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import StorePlanPreview from './StorePlanPreview';

test('shows paid seller plans without subscription controls', () => {
  render(<StorePlanPreview />);

  expect(screen.getByRole('heading', { name: /see pawzzle seller plans before you apply/i })).toBeVisible();
  expect(screen.getByText(/preview only/i)).toBeVisible();
  expect(screen.getAllByText(/account settings/i).length).toBeGreaterThan(0);
  expect(screen.getByText('Pawzzle Starter')).toBeVisible();
  expect(screen.getByText('Pawzzle Growth')).toBeVisible();
  expect(screen.getByText('Pawzzle Professional')).toBeVisible();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /choose/i })).not.toBeInTheDocument();
});
