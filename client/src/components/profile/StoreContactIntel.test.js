import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import StoreContactIntel from './StoreContactIntel';

test('renders readable Store contact links without truncating their values', () => {
  render(<StoreContactIntel contactInfo={{ phone: '0917 123 4567', email: 'care@example.com' }} />);

  expect(screen.getByRole('link', { name: /Phone 0917 123 4567/i })).toHaveAttribute('href', 'tel:0917 123 4567');
  expect(screen.getByRole('link', { name: /Email care@example.com/i })).toHaveAttribute('href', 'mailto:care@example.com');
  expect(screen.getByText('care@example.com')).toHaveClass('break-words', 'text-slate-100');
});

test('shows explicit non-interactive fallbacks when public contact details are missing', () => {
  render(<StoreContactIntel contactInfo={{}} />);

  expect(screen.getByLabelText('Phone not provided')).toHaveTextContent('Not provided');
  expect(screen.getByLabelText('Email not provided')).toHaveTextContent('Not provided');
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
