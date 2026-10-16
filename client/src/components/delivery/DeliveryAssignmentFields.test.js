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
  render(<DeliveryAssignmentFields {...props} parcel={{ weightKg: 5, parcelCount: 1, confirmed: false }} onParcelChange={onParcelChange} />);
  fireEvent.click(screen.getByRole('checkbox', { name: /I confirm this packaged weight/i }));
  expect(onParcelChange).toHaveBeenCalledWith(expect.objectContaining({ confirmed: true }));
  fireEvent.change(screen.getByLabelText(/Packaged parcel weight/i), { target: { value: '6' } });
  expect(onParcelChange).toHaveBeenLastCalledWith(expect.objectContaining({ weightKg: '6', confirmed: false }));
});

test('renders an authoritative automatic weight as read only and keeps parcel count editable', () => {
  const onParcelChange = jest.fn();
  render(<DeliveryAssignmentFields {...props} parcel={{ weightKg: 2.85, parcelCount: 1, confirmed: true }} onParcelChange={onParcelChange} weightSummary={{ status: 'complete', totalProductWeightMilligrams: 2750000, additionalPackagingWeightMilligrams: 100000, estimatedParcelWeightMilligrams: 2850000, weightKg: 2.85 }} />);
  expect(screen.getAllByText('2.85 kg')).toHaveLength(2);
  expect(screen.getByText('0.1 kg')).toBeInTheDocument();
  expect(screen.queryByLabelText(/Packaged parcel weight/i)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/Parcel count/i), { target: { value: '2' } });
  expect(onParcelChange).toHaveBeenCalledWith(expect.objectContaining({ parcelCount: '2', confirmed: true }));
});

test('missing product weight names are visible and require a documented exception', () => {
  const onParcelChange = jest.fn();
  render(<DeliveryAssignmentFields {...props} parcel={{ weightKg: '', parcelCount: 1, confirmed: false }} onParcelChange={onParcelChange} weightSummary={{ status: 'missing_product_weight', missingItems: [{ itemId: 'p1', name: 'Legacy Kibble' }] }} assignmentReadiness={{ reason: 'missing_product_weight', message: 'Weight data is required.' }} />);
  expect(screen.getByText(/Legacy Kibble/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/Documented weight estimate/i), { target: { value: '3.4' } });
  fireEvent.change(screen.getByLabelText(/Manual estimate reason/i), { target: { value: 'Measured on the Store packing scale.' } });
  expect(onParcelChange).toHaveBeenNthCalledWith(1, expect.objectContaining({ weightKg: '3.4', manualException: true, confirmed: false }));
  expect(onParcelChange).toHaveBeenNthCalledWith(2, expect.objectContaining({ manualExceptionReason: 'Measured on the Store packing scale.', manualException: true }));
});
