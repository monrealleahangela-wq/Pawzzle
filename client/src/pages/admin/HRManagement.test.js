import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import HRManagement, { ManagementAttendanceCalendar } from './HRManagement';
import { hrService } from '../../services/apiService';

let mockUser = { _id: 'owner-a', role: 'store_owner' };

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser })
}));

jest.mock('../../services/apiService', () => ({
  hrService: {
    getSettings: jest.fn(),
    getEmployees: jest.fn(),
    getCompensation: jest.fn(),
    updateCompensation: jest.fn(),
    getPayrollPeriods: jest.fn(),
    getPayrollPeriod: jest.fn(),
    getPayrollReports: jest.fn()
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

describe('ManagementAttendanceCalendar', () => {
  const records = [
    {
      _id: 'attendance-20', workDate: '2026-10-20', status: 'incomplete',
      employee: { _id: 'rider-a', firstName: 'Rina', lastName: 'Rider', staffType: 'delivery_rider' },
      timeIn: { at: '2026-10-20T08:00:00+08:00' }
    },
    {
      _id: 'attendance-19-a', workDate: '2026-10-19', status: 'present',
      employee: { _id: 'rider-a', firstName: 'Rina', lastName: 'Rider', staffType: 'delivery_rider' },
      timeIn: { at: '2026-10-19T08:00:00+08:00' }, timeOut: { at: '2026-10-19T17:00:00+08:00' }
    },
    {
      _id: 'attendance-19-b', workDate: '2026-10-19', status: 'absent',
      employee: { _id: 'dispatcher-a', firstName: 'Dex', lastName: 'Dispatcher', staffType: 'delivery_dispatcher' }
    }
  ];

  test('selects one date and shows only that day attendance', () => {
    render(<ManagementAttendanceCalendar records={records} />);

    const initialDetails = screen.getByRole('region', { name: 'Attendance for Tuesday, October 20, 2026' });
    expect(within(initialDetails).getByText('Rina Rider')).toBeInTheDocument();
    expect(within(initialDetails).queryByText('Dex Dispatcher')).not.toBeInTheDocument();

    const october19 = screen.getByRole('button', { name: 'Select October 19, 2026, 2 attendance records' });
    fireEvent.click(october19);

    const selectedDetails = screen.getByRole('region', { name: 'Attendance for Monday, October 19, 2026' });
    expect(within(selectedDetails).getByText('Rina Rider')).toBeInTheDocument();
    expect(within(selectedDetails).getByText('Dex Dispatcher')).toBeInTheDocument();
    expect(october19).toHaveAttribute('aria-pressed', 'true');
  });

  test('supports month navigation and a clear empty-day state', () => {
    render(<ManagementAttendanceCalendar records={records} />);

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('heading', { name: 'November 2026' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));

    fireEvent.click(screen.getByRole('button', { name: 'Select October 18, 2026, 0 attendance records' }));
    const emptyDetails = screen.getByRole('region', { name: 'Attendance for Sunday, October 18, 2026' });
    expect(within(emptyDetails).getByText('No attendance entries')).toBeInTheDocument();
  });
});

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

  test('Finance reports separate employee deductions from employer contributions', async () => {
    hrService.getPayrollReports.mockResolvedValue({ data: {
      periods: [], remittances: [],
      totals: { grossPay: 30000, employeeDeductions: 3500, employerContributions: 2800, netPay: 26500 },
      payslips: [{
        _id: 'slip-report', employeeSnapshot: { name: 'Rina Rider' },
        payrollPeriod: { periodStart: '2026-09-01', periodEnd: '2026-09-30' },
        statutoryDeductions: { sss: 750, philHealth: 750, pagIbig: 200, withholdingTax: 300 },
        employerContributions: { total: 2800 }, netPay: 26500, paymentStatus: 'processing'
      }]
    } });

    render(<MemoryRouter initialEntries={['/admin/hr?tab=reports']}><HRManagement /></MemoryRouter>);
    expect(await screen.findByText('Employee deductions')).toBeInTheDocument();
    expect(screen.getByText('Employer contributions')).toBeInTheDocument();
    expect(screen.getByText('Government Remittances')).toBeInTheDocument();
    expect(screen.getByText('Rina Rider')).toBeInTheDocument();
  });
});
