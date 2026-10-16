import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import EmployeeHR from './EmployeeHR';
import { hrService } from '../../services/apiService';

jest.mock('../../services/apiService', () => ({ hrService: {
  getMyPayslips: jest.fn(), getMyLeaves: jest.fn(), cancelLeave: jest.fn()
} }));
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

test('employee can request cancellation of approved leave while cancellation awaits Store review', async () => {
  hrService.getMyLeaves.mockResolvedValue({ data: { leaves: [{
    _id: 'own-leave', status: 'approved', leaveTypeName: 'Vacation Leave', isPaid: true,
    startDate: '2026-10-19T00:00:00.000Z', endDate: '2026-10-19T23:59:59.999Z', reason: 'Personal leave request'
  }], leaveTypes: [] } });
  hrService.cancelLeave.mockResolvedValue({ data: { message: 'Cancellation request submitted for Store review.' } });
  render(<MemoryRouter><EmployeeHR initialTab="leave" /></MemoryRouter>);

  expect(await screen.findByRole('button', { name: 'Request cancellation' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Request cancellation' }));
  await waitFor(() => expect(hrService.cancelLeave).toHaveBeenCalledWith('own-leave', {}));
});
