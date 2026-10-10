import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
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

test('requires an explicit package confirmation and resets it when measurements change', () => {
  const onParcelChange = jest.fn();
  render(<DeliveryAssignmentFields {...props} parcel={{ weightKg: 5, parcelCount: 1, estimated: true, confirmed: false }} onParcelChange={onParcelChange} />);
  expect(screen.getByText(/Estimated from saved product weights/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: /I confirm this packaged weight/i }));
  expect(onParcelChange).toHaveBeenCalledWith(expect.objectContaining({ confirmed: true }));
  fireEvent.change(screen.getByLabelText(/Packaged parcel weight/i), { target: { value: '6' } });
  expect(onParcelChange).toHaveBeenLastCalledWith(expect.objectContaining({ weightKg: '6', confirmed: false }));
});
