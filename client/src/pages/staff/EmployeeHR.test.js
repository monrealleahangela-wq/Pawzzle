import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import EmployeeHR from './EmployeeHR';
import { hrService } from '../../services/apiService';

jest.mock('../../services/apiService', () => ({
  hrService: {
    getMyPayslips: jest.fn(),
    getMyLeaves: jest.fn()
  }
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

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
