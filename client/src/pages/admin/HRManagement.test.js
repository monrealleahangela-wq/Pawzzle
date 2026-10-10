import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import HRManagement from './HRManagement';
import { hrService } from '../../services/apiService';

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'owner-a', role: 'store_owner' } })
}));

jest.mock('../../services/apiService', () => ({
  hrService: {
    getSettings: jest.fn(),
    getEmployees: jest.fn(),
    getCompensation: jest.fn(),
    updateCompensation: jest.fn()
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

describe('HRManagement Rider payroll setup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    hrService.getSettings.mockResolvedValue({ data: { settings: {}, workplace: {} } });
    hrService.getEmployees.mockResolvedValue({ data: { employees: [rider] } });
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

    fireEvent.change(screen.getByRole('combobox', { name: 'Employment status' }), { target: { value: 'part_time' } });
    fireEvent.change(baseRate, { target: { value: '850' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Employment & Compensation' }));

    await waitFor(() => expect(hrService.updateCompensation).toHaveBeenCalledWith('rider-a', expect.objectContaining({
      employmentStatus: 'part_time',
      compensation: expect.objectContaining({ compensationType: 'salary', baseRate: '850' })
    })));
    await waitFor(() => expect(hrService.getEmployees).toHaveBeenCalledTimes(2));
  });
});
