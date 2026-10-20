import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import EmployeeHR from './EmployeeHR';
import { hrService } from '../../services/apiService';

jest.mock('../../services/apiService', () => ({
  hrService: {
    getMyAttendance: jest.fn(),
    getMyAttendanceCorrections: jest.fn(),
    getMyPayslips: jest.fn(),
    getMyLeaves: jest.fn(),
    timeIn: jest.fn(),
    timeOut: jest.fn()
  }
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

test('workplace check has a visible submit action and sends the off-site reason', async () => {
  hrService.getMyAttendance.mockResolvedValue({ data: {
    today: null,
    schedule: { isWorkDay: true, start: '09:00', end: '18:00' },
    records: [],
    correctionRequests: [],
    timeInWindow: { allowed: true, message: 'You can time in now.' },
    locationPolicy: { outsideGeofencePolicy: 'flag' }
  } });
  hrService.timeIn.mockResolvedValue({ data: { message: 'Time in recorded.' } });
  hrService.getMyAttendanceCorrections.mockResolvedValue({ data: { requests: [] } });
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: success => success({
        coords: { latitude: 14.5995, longitude: 120.9842, accuracy: 12 }
      })
    }
  });

  render(<MemoryRouter><EmployeeHR initialTab="attendance" /></MemoryRouter>);
  fireEvent.change(await screen.findByPlaceholderText('Explain the remote or off-site work reason'), {
    target: { value: 'Assigned to an off-site delivery.' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Submit Time In' }));

  await waitFor(() => expect(hrService.timeIn).toHaveBeenCalledWith({
    latitude: 14.5995,
    longitude: 120.9842,
    accuracy: 12,
    offsiteReason: 'Assigned to an off-site delivery.'
  }));
});

test('staff sees only own approved salary payment status and masked reference before payslip finalization', async () => {
  hrService.getMyPayslips.mockResolvedValue({ data: {
    payslips: [],
    paymentStatuses: [{ payslipId: 'own-slip', payrollPeriod: { periodStart: '2026-09-01', periodEnd: '2026-09-30' }, netPay: 12000, paymentStatus: 'for_confirmation', externalMethod: 'bank_transfer', referenceMask: '****1234' }],
    availability: { reason: 'awaiting_payment_record', payrollStatus: 'approved' }
  } });
  render(<MemoryRouter><EmployeeHR initialTab="payslips" /></MemoryRouter>);
  expect(await screen.findByText('Salary payment status')).toBeInTheDocument();
  expect(screen.getByText('for confirmation')).toBeInTheDocument();
  expect(screen.getByText(/reference \*\*\*\*1234/)).toBeInTheDocument();
  expect(screen.queryByText('0000123456')).not.toBeInTheDocument();
  expect(screen.queryByText('No finalized payslips yet')).toBeInTheDocument();
});

test('staff sees persisted leave credits, carry-over, usage, and pending amounts', async () => {
  hrService.getMyLeaves.mockResolvedValue({ data: {
    leaves: [],
    leaveTypes: [{ key: 'vacation', name: 'Vacation Leave', isPaid: true }],
    balances: [{ key: 'vacation', name: 'Vacation Leave', annualCredits: 10, carryOver: 2, entitlement: 12, approvedUsed: 3, pending: 1, remaining: 9 }]
  } });
  render(<MemoryRouter><EmployeeHR initialTab="leave" /></MemoryRouter>);

  expect(await screen.findByText('Leave Balances')).toBeInTheDocument();
  expect(screen.getByText('Approved used: 3 · Pending: 1')).toBeInTheDocument();
  expect(screen.getByText('Includes 2 carried-over day(s).')).toBeInTheDocument();
  expect(screen.getByText('9 day(s) remaining')).toBeInTheDocument();
});
