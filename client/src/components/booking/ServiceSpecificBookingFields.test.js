import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ServiceSpecificBookingFields from './ServiceSpecificBookingFields';

test('Full Groom displays the selected package once and keeps safety questions required', () => {
  render(<ServiceSpecificBookingFields
    service={{ name: 'Full Grooming', category: 'grooming', assignedStaff: [] }}
    details={{ coatCondition: '', nailTrimming: '', earCleaning: '', behaviorConcern: '' }}
    onChange={jest.fn()}
    errors={{}}
    pet={{}}
  />);

  expect(screen.getByText('Selected grooming package')).toBeInTheDocument();
  expect(screen.getByText('Full Grooming')).toBeInTheDocument();
  expect(screen.queryByText('Grooming package')).not.toBeInTheDocument();
  expect(screen.getByText('Nail trimming preference (optional)')).toBeInTheDocument();
  expect(screen.getByText('Ear cleaning preference (optional)')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Nail trimming preference: Package standard' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Ear cleaning preference: Package standard' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('Can your pet become aggressive or anxious?')).toBeInTheDocument();
});
