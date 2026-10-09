import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import DeliveryAssignmentFields from './DeliveryAssignmentFields';

const props = {
  parcel: { weightKg: 5, parcelCount: 1 },
  onParcelChange: jest.fn(),
  riders: []
};

test('shows a server-authoritative setup requirement as normal eligibility status', () => {
  render(<DeliveryAssignmentFields {...props} assignmentReadiness={{
    reason: 'vehicle_setup_required',
    message: 'Active Delivery Riders require a supported vehicle type, maximum weight, and maximum parcel count before assignment.'
  }} />);
  expect(screen.getByRole('status')).toHaveTextContent('supported vehicle type, maximum weight, and maximum parcel count');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('renders an API failure as an alert instead of an empty eligibility status', () => {
  render(<DeliveryAssignmentFields {...props} assignmentReadiness={{ error: true, message: 'Unable to check Rider eligibility.' }} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to check Rider eligibility.');
  expect(screen.queryByText(/backend assigns an eligible Rider atomically/i)).not.toBeInTheDocument();
});
