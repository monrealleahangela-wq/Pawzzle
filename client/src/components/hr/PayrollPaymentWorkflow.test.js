import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import PayrollPaymentWorkflow from './PayrollPaymentWorkflow';
import { hrService } from '../../services/apiService';

jest.mock('../../services/apiService', () => ({
  hrService: {
    getPayrollPayments: jest.fn(),
    createPayrollPayment: jest.fn(),
    retryPayrollPayment: jest.fn(),
    updatePayrollPayment: jest.fn(),
    confirmPayrollPayment: jest.fn(),
    getPayrollPaymentProof: jest.fn()
  }
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const period = { _id: 'period-1', status: 'approved' };
const pending = {
  payslip: { _id: 'slip-1', employee: { _id: 'employee-1', firstName: 'Rider', lastName: 'One' }, employeeSnapshot: { name: 'Rider One' }, netPay: 12000 },
  paymentStatus: 'pending', attempts: []
};
const awaiting = {
  payslip: pending.payslip,
  paymentStatus: 'for_confirmation',
  attempts: [{ _id: 'attempt-1', status: 'for_confirmation', amount: 12000, externalMethod: 'bank_transfer', referenceMask: '****1234', transferAt: '2026-10-05T03:00:00Z', preparedBy: 'finance-1', evidenceSubmittedBy: 'finance-1', proof: { available: true } }]
};

describe('PayrollPaymentWorkflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    hrService.getPayrollPayments.mockResolvedValue({ data: { payments: [pending], summary: { requiredEmployeeCount: 1, confirmedEmployeeCount: 0, outstandingAmount: 12000 } } });
    hrService.createPayrollPayment.mockResolvedValue({ data: { message: 'Recorded as processing.' } });
  });

  test('Finance can prepare an exact external payment but does not receive confirmation authority by default', async () => {
    render(<PayrollPaymentWorkflow period={period} actorId="finance-1" canPrepare canConfirm={false} />);
    expect(await screen.findByText('Rider One')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Record external payment' }));
    expect(screen.getByLabelText('Exact approved net amount')).toHaveValue('12000');
    expect(screen.getByRole('option', { name: /Processing/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /For Confirmation/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm external payment' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('External reference'), { target: { value: 'BANK-TRANSFER-1234' } });
    fireEvent.change(screen.getByLabelText('Recipient account name'), { target: { value: 'Rider One' } });
    fireEvent.change(screen.getByLabelText('Recipient account number'), { target: { value: '0000123456' } });
    hrService.getPayrollPayments.mockResolvedValueOnce({ data: { payments: [pending], summary: { requiredEmployeeCount: 1, confirmedEmployeeCount: 0, outstandingAmount: 12000 } } }).mockResolvedValueOnce({ data: { payments: [{ ...pending, paymentStatus: 'processing' }], summary: { requiredEmployeeCount: 1, confirmedEmployeeCount: 0, outstandingAmount: 12000 } } });
    fireEvent.submit(screen.getByRole('button', { name: 'Record as Processing' }).closest('form'));
    await waitFor(() => expect(hrService.createPayrollPayment).toHaveBeenCalledWith('period-1', 'slip-1', expect.objectContaining({ amount: 12000, status: 'processing' })));
    expect(await screen.findByText('External salary payments')).toBeInTheDocument();
    await waitFor(() => expect(hrService.getPayrollPayments).toHaveBeenCalledTimes(2));
  });

  test('independent confirmer can confirm another user’s submitted proof, but the preparer cannot', async () => {
    hrService.getPayrollPayments.mockReset().mockResolvedValue({ data: { payments: [awaiting], summary: { requiredEmployeeCount: 1, confirmedEmployeeCount: 0, outstandingAmount: 12000 } } });
    const prompt = jest.spyOn(window, 'prompt').mockReturnValue('Checked bank statement independently.');
    const { rerender } = render(<PayrollPaymentWorkflow period={period} actorId="finance-1" canPrepare canConfirm />);
    expect(await screen.findByText('Rider One')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm external payment' })).not.toBeInTheDocument();
    rerender(<PayrollPaymentWorkflow period={period} actorId="owner-1" canPrepare canConfirm />);
    expect(await screen.findByRole('button', { name: 'Confirm external payment' })).toBeInTheDocument();
    hrService.confirmPayrollPayment.mockResolvedValue({ data: { message: 'Payment independently confirmed.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm external payment' }));
    await waitFor(() => expect(hrService.confirmPayrollPayment).toHaveBeenCalledWith('attempt-1', { reason: 'Checked bank statement independently.' }));
    prompt.mockRestore();
  });
});
