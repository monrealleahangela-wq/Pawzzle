import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import QRScannerModal from './QRScannerModal';
import { adminBookingService } from '../services/apiService';

jest.mock('html5-qrcode', () => ({ Html5Qrcode: jest.fn().mockImplementation(() => ({
  isScanning: false,
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
  clear: jest.fn()
})) }));

jest.mock('../services/apiService', () => ({
  adminBookingService: {
    verifyReservation: jest.fn(),
    checkIn: jest.fn()
  },
  api: { post: jest.fn() }
}));

beforeEach(() => jest.clearAllMocks());

test('manual backup code verifies first, then confirms check-in as a separate operation', async () => {
  adminBookingService.verifyReservation.mockResolvedValue({ data: { verification: {
    bookingId: 'booking-123', reference: 'BOOK123', service: 'General Checkup', pet: 'Milo', startTime: '14:00', endTime: '15:00', store: 'Pawzzle Clinic'
  } } });
  adminBookingService.checkIn.mockResolvedValue({ data: { message: 'Reservation verified and check-in recorded.' } });
  const onClose = jest.fn();
  const onScanSuccess = jest.fn();
  render(<QRScannerModal isOpen onClose={onClose} onScanSuccess={onScanSuccess} />);

  expect(adminBookingService.verifyReservation).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Start camera' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/backup code/i), { target: { value: 'abcd-efgh-jklm-npqr' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify backup code' }));

  expect(await screen.findByText('Credential verified')).toBeInTheDocument();
  expect(adminBookingService.verifyReservation).toHaveBeenCalledWith('ABCDEFGHJKLMNPQR', 'backup_code');
  expect(adminBookingService.checkIn).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm check-in' }));
  await waitFor(() => expect(adminBookingService.checkIn).toHaveBeenCalledWith('booking-123', 'ABCDEFGHJKLMNPQR', 'backup_code'));
  await waitFor(() => expect(onScanSuccess).toHaveBeenCalled());
  expect(onClose).toHaveBeenCalled();
});

test('malformed backup codes are rejected in the UI without a network request', async () => {
  render(<QRScannerModal isOpen onClose={jest.fn()} />);
  fireEvent.change(screen.getByLabelText(/backup code/i), { target: { value: 'bad-code' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify backup code' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('16-character backup code');
  expect(adminBookingService.verifyReservation).not.toHaveBeenCalled();
});

test('camera permission failure is explained and manual backup remains available', async () => {
  const { Html5Qrcode } = require('html5-qrcode');
  Html5Qrcode.mockImplementationOnce(() => ({
    isScanning: false,
    start: jest.fn().mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' })),
    stop: jest.fn().mockResolvedValue(undefined), clear: jest.fn()
  }));
  render(<QRScannerModal isOpen onClose={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Camera access was denied');
  expect(screen.getByLabelText(/backup code/i)).toBeInTheDocument();
});

test('camera-unavailable error is explained with the backup-code option retained', async () => {
  const { Html5Qrcode } = require('html5-qrcode');
  Html5Qrcode.mockImplementationOnce(() => ({
    isScanning: false,
    start: jest.fn().mockRejectedValue(Object.assign(new Error('no camera'), { name: 'NotFoundError' })),
    stop: jest.fn().mockResolvedValue(undefined), clear: jest.fn()
  }));
  render(<QRScannerModal isOpen onClose={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No camera is available');
  expect(screen.getByLabelText(/backup code/i)).toBeInTheDocument();
});

test('duplicate camera frames are debounced', async () => {
  const { Html5Qrcode } = require('html5-qrcode');
  const scanner = {
    isScanning: false,
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined), clear: jest.fn()
  };
  Html5Qrcode.mockImplementationOnce(() => scanner);
  adminBookingService.verifyReservation.mockResolvedValue({ data: { verification: {
    bookingId: 'booking-camera', reference: 'BOOKCAMERA', service: 'Grooming', pet: 'Milo', startTime: '14:00', endTime: '15:00', store: 'Pawzzle Store'
  } } });
  render(<QRScannerModal isOpen onClose={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
  await waitFor(() => expect(scanner.start).toHaveBeenCalled());
  const decoded = scanner.start.mock.calls[0][2];
  const token = `PZQ1.${'a'.repeat(43)}`;
  act(() => { decoded(token); decoded(token); });
  await waitFor(() => expect(adminBookingService.verifyReservation).toHaveBeenCalledTimes(1));

});

test('closing releases an active camera scanner', async () => {
  const { Html5Qrcode } = require('html5-qrcode');
  const scanner = {
    isScanning: true,
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined), clear: jest.fn()
  };
  Html5Qrcode.mockImplementationOnce(() => scanner);
  const { rerender } = render(<QRScannerModal isOpen onClose={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
  await waitFor(() => expect(scanner.start).toHaveBeenCalled());
  rerender(<QRScannerModal isOpen={false} onClose={jest.fn()} />);
  await waitFor(() => expect(scanner.stop).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(scanner.clear).toHaveBeenCalledTimes(1));
});

test('unmount releases an active camera scanner', async () => {
  const { Html5Qrcode } = require('html5-qrcode');
  const scanner = {
    isScanning: true,
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined), clear: jest.fn()
  };
  Html5Qrcode.mockImplementationOnce(() => scanner);
  const { unmount } = render(<QRScannerModal isOpen onClose={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
  await waitFor(() => expect(scanner.start).toHaveBeenCalled());
  unmount();
  await waitFor(() => expect(scanner.stop).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(scanner.clear).toHaveBeenCalledTimes(1));
});

test('network verification failure keeps the manual field available and does not claim success', async () => {
  adminBookingService.verifyReservation.mockRejectedValue({ response: { data: { message: 'Reservation unavailable' } } });
  render(<QRScannerModal isOpen onClose={jest.fn()} />);
  fireEvent.change(screen.getByLabelText(/backup code/i), { target: { value: 'ABCD-EFGH-JKLM-NPQR' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify backup code' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Reservation unavailable');
  expect(screen.queryByText('Credential verified')).not.toBeInTheDocument();
  expect(screen.getByLabelText(/backup code/i)).toBeInTheDocument();
});
