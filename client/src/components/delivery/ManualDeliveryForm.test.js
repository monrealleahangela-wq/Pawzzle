import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ManualDeliveryForm from './ManualDeliveryForm';
import { logisticsService } from '../../services/apiService';

jest.mock('../../services/apiService', () => ({
  logisticsService: { createManualDelivery: jest.fn(), updateManualDelivery: jest.fn() }
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

beforeEach(() => jest.clearAllMocks());

test('submits typed pickup and drop-off addresses without invented location data', async () => {
  logisticsService.createManualDelivery.mockResolvedValue({ data: { delivery: { _id: 'manual-1' } } });
  const onSaved = jest.fn();
  render(<ManualDeliveryForm onClose={jest.fn()} onSaved={onSaved}/>);
  fireEvent.change(screen.getByLabelText(/Recipient name/i), { target: { value: 'Demo Recipient' } });
  fireEvent.change(screen.getByLabelText(/Recipient phone/i), { target: { value: '09170000000' } });
  fireEvent.change(screen.getByRole('combobox', { name: /Pickup address/i }), { target: { value: 'Store pickup address' } });
  fireEvent.change(screen.getByRole('combobox', { name: /Drop-off address/i }), { target: { value: 'Customer delivery address' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create delivery' }));
  await waitFor(() => expect(logisticsService.createManualDelivery).toHaveBeenCalled());
  const payload = logisticsService.createManualDelivery.mock.calls[0][0];
  expect(payload.pickupAddress).toEqual({ formattedAddress: 'Store pickup address' });
  expect(payload.dropoffAddress).toEqual({ formattedAddress: 'Customer delivery address' });
  expect(payload.pickupAddress).not.toHaveProperty('coordinates');
  expect(payload.dropoffAddress).not.toHaveProperty('placeId');
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ _id: 'manual-1' }));
});
test('reopens an existing manual delivery with its saved addresses and updates it', async () => {
  logisticsService.updateManualDelivery.mockResolvedValue({ data: { delivery: { _id: 'manual-2' } } });
  const delivery = { _id: 'manual-2', manualDelivery: {
    recipientName: 'Saved Recipient', recipientPhone: '09171111111',
    pickupAddress: { formattedAddress: 'Saved pickup', coordinates: { lat: 14.4, lng: 120.9 } },
    dropoffAddress: { formattedAddress: 'Saved destination', placeId: 'saved-place', coordinates: { lat: 14.3, lng: 120.8 } },
    notes: 'Saved note'
  } };
  render(<ManualDeliveryForm delivery={delivery} onClose={jest.fn()} onSaved={jest.fn()}/>);
  expect(screen.getByRole('combobox', { name: /Pickup address/i })).toHaveValue('Saved pickup');
  const destination = screen.getByRole('combobox', { name: /Drop-off address/i });
  expect(destination).toHaveValue('Saved destination');
  fireEvent.change(destination, { target: { value: 'Updated destination text' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(logisticsService.updateManualDelivery).toHaveBeenCalledWith(
    'manual-2', expect.objectContaining({ dropoffAddress: { formattedAddress: 'Updated destination text' } })
  ));
});
