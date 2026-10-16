import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import HRManagement from './HRManagement';
import { hrService } from '../../services/apiService';

let mockUser = { _id: 'owner-a', role: 'store_owner' };

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser })
}));

jest.mock('../../services/apiService', () => ({
  hrService: {
    getSettings: jest.fn(),
    getEmployees: jest.fn(),
    getLeaves: jest.fn(),
    reviewLeave: jest.fn(),
    getCompensation: jest.fn(),
    updateCompensation: jest.fn(),
    getPayrollPeriods: jest.fn(),
    getPayrollPeriod: jest.fn()
  }
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn() }
}));

const rider = {
  _id: 'rider-a',
  firstName: 'Rina',
  lastName: 'Rider',
  role: 'staff',
  staffType: 'delivery_rider',
  payrollEligibility: {
    eligible: false,
    code: 'compensation_missing',
    message: 'Configure a positive salary, daily, or hourly base rate in Compensation before computing payroll.'
  }
};
const dispatcher = {
  _id: 'dispatcher-a',
  firstName: 'Dex',
  lastName: 'Dispatcher',
  role: 'staff',
  staffType: 'delivery_dispatcher',
  payrollEligibility: {
    eligible: false,
    code: 'role_retired',
    message: 'Dispatcher is a retired role and is excluded from new payroll. Reassign an active staff role if this person is still employed.'
  }
};

describe('HRManagement Rider payroll setup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { _id: 'owner-a', role: 'store_owner' };
    hrService.getSettings.mockResolvedValue({ data: { settings: {}, workplace: {} } });
    hrService.getEmployees.mockResolvedValue({ data: { employees: [rider, dispatcher] } });
    hrService.getCompensation.mockResolvedValue({
      data: {
        employee: {
          employmentProfile: {
            staffId: 'STF-0042',
            employmentStatus: 'active',
            dateHired: '2026-01-10T00:00:00.000Z'
          }
        }
      }
    });
    hrService.updateCompensation.mockResolvedValue({ data: { message: 'Employee compensation saved.' } });
  });

  test('shows an active Rider and the exact missing payroll setup requirement', async () => {
    render(<MemoryRouter initialEntries={['/admin/hr?tab=employees']}><HRManagement /></MemoryRouter>);

    const employeeSelect = await screen.findByRole('combobox', { name: 'Employee' });
    expect(await screen.findByRole('option', { name: /Rina Rider.*delivery rider.*setup required/i })).toBeInTheDocument();
    fireEvent.change(employeeSelect, { target: { value: 'rider-a' } });

    expect(await screen.findByRole('status')).toHaveTextContent('Payroll setup required');
    expect(screen.getByRole('status')).toHaveTextContent('Configure a positive salary, daily, or hourly base rate');
    expect(await screen.findByDisplayValue('STF-0042')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Employment status' })).toHaveValue('active');
  });

  test('allows authorized HR to save explicit employment and compensation without inventing a rate', async () => {
    render(<MemoryRouter initialEntries={['/admin/hr?tab=employees']}><HRManagement /></MemoryRouter>);

    const employeeSelect = await screen.findByRole('combobox', { name: 'Employee' });
    await screen.findByRole('option', { name: /Rina Rider.*setup required/i });
    fireEvent.change(employeeSelect, { target: { value: 'rider-a' } });
    await screen.findByDisplayValue('STF-0042');
    const baseRate = await screen.findByRole('spinbutton', { name: 'Base rate' });
    expect(baseRate).toHaveValue(null);
    expect(screen.getByRole('combobox', { name: 'Compensation basis' })).toHaveValue('monthly');

    fireEvent.change(screen.getByRole('combobox', { name: 'Employment status' }), { target: { value: 'part_time' } });
    fireEvent.change(baseRate, { target: { value: '850' } });
    fireEvent.change(screen.getByLabelText('Effective date'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Change reason'), { target: { value: 'Approved monthly salary configuration' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Employment & Compensation' }));

    await waitFor(() => expect(hrService.updateCompensation).toHaveBeenCalledWith('rider-a', expect.objectContaining({
      employmentStatus: 'part_time',
      changeReason: 'Approved monthly salary configuration',
      compensation: expect.objectContaining({ compensationType: 'salary', compensationBasis: 'monthly', baseRate: '850', effectiveDate: '2026-10-01' })
    })));
    await waitFor(() => expect(hrService.getEmployees).toHaveBeenCalledTimes(2));
  });

  test('shows legacy Dispatcher as retired and prevents new compensation enrollment', async () => {
    render(<MemoryRouter initialEntries={['/admin/hr?tab=employees']}><HRManagement /></MemoryRouter>);

    const employeeSelect = await screen.findByRole('combobox', { name: 'Employee' });
    expect(await screen.findByRole('option', { name: /Dex Dispatcher.*retired role - excluded from new payroll/i })).toBeInTheDocument();
    fireEvent.change(employeeSelect, { target: { value: 'dispatcher-a' } });

    expect(await screen.findByRole('status')).toHaveTextContent('Dispatcher is a retired role');
    expect(screen.getByRole('button', { name: 'Save Employment & Compensation' })).toBeDisabled();
  });

  test('Finance cannot use payment controls for a period containing its own salary', async () => {
    mockUser = { _id: 'finance-a', role: 'staff', staffType: 'finance_staff' };
    const period = {
      _id: 'period-a',
      periodStart: '2026-09-01T00:00:00.000Z',
      periodEnd: '2026-09-15T00:00:00.000Z',
      payDate: '2026-09-20T00:00:00.000Z',
      frequency: 'semi_monthly',
      status: 'approved',
      totals: { netPay: 30000 }
    };
    hrService.getPayrollPeriods.mockResolvedValue({ data: { periods: [period] } });
    hrService.getPayrollPeriod.mockResolvedValue({ data: {
      period,
      payslips: [{
        _id: 'slip-a',
        employee: { _id: 'finance-a' },
        employeeSnapshot: { name: 'Fina Finance', compensationBasis: 'monthly' },
        attendanceSummary: { workedMinutes: 0, daysPresent: 0, absences: 0 },
        basePay: 30000,
        additions: [],
        deductions: [],
        netPay: 30000
      }]
    } });

    render(<MemoryRouter initialEntries={['/admin/hr?tab=payroll']}><HRManagement /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /Sep 1, 2026.*Sep 15, 2026/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('includes your salary');
    expect(screen.queryByRole('button', { name: 'Record as Paid' })).not.toBeInTheDocument();
  });

  test('authorized Store reviewer can confirm or decline an approved-leave cancellation request', async () => {
    hrService.getLeaves.mockResolvedValue({ data: { leaves: [{
      _id: 'leave-a', status: 'cancellation_requested', leaveTypeName: 'Vacation Leave', isPaid: true,
      startDate: '2026-10-19T00:00:00.000Z', endDate: '2026-10-19T23:59:59.999Z',
      employee: { firstName: 'Ari', lastName: 'Employee' }
    }] } });
    hrService.reviewLeave.mockResolvedValue({ data: { message: 'Approved leave cancelled and reversed.' } });
    render(<MemoryRouter initialEntries={['/admin/hr?tab=leave']}><HRManagement /></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: 'Confirm Cancellation' }));
    await waitFor(() => expect(hrService.reviewLeave).toHaveBeenCalledWith('leave-a', { status: 'cancelled' }));
    expect(screen.getByRole('button', { name: 'Keep Approved' })).toBeInTheDocument();
  });

  test('payroll settings clearly show the fail-closed statutory gate', async () => {
    hrService.getSettings.mockResolvedValue({ data: { settings: {
      payrollFrequency: 'weekly', attendanceRadiusMeters: 100, gracePeriodMinutes: 10,
      outsideGeofencePolicy: 'reject', defaultShift: { start: '09:00', end: '17:00' }
    }, workplace: { coordinates: { lat: 14.3, lng: 121 } } } });
    render(<MemoryRouter initialEntries={['/admin/hr?tab=settings']}><HRManagement /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Payroll & Attendance Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Settings' })).toBeInTheDocument();
    expect(screen.getByText(/Statutory calculators are isolated and not active in payroll/i)).toBeInTheDocument();
    expect(screen.getByText(/Newly computed payroll remains blocked from review and approval/i)).toBeInTheDocument();
  });

});
