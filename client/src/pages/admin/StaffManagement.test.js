import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StaffManagement from './StaffManagement';
import { staffService } from '../../services/apiService';

jest.mock('../../services/apiService', () => ({
  getImageUrl: value => value,
  staffService: {
    getAll: jest.fn(),
    getConfiguration: jest.fn(),
    update: jest.fn()
  },
  uploadService: { uploadImage: jest.fn() }
}));

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'owner-1', role: 'store_owner' } })
}));

jest.mock('../../utils/authorization', () => ({ hasUiActionPermission: jest.fn(() => false) }));
jest.mock('../../components/admin/SpecializedStaffProfileModal', () => () => null);

beforeEach(() => {
  jest.clearAllMocks();
  const pendingRequest = new Promise(() => {});
  staffService.getAll.mockReturnValue(pendingRequest);
  staffService.getConfiguration.mockReturnValue(pendingRequest);
});

const renderPage = () => render(
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <StaffManagement />
  </MemoryRouter>
);

test('staff form is portaled above the application shell with a visible close button', () => {
  renderPage();
  expect(staffService.getConfiguration).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('button', { name: 'Add Staff' }));

  const dialog = screen.getByRole('dialog', { name: /Add Staff/ });
  const viewport = dialog.closest('[data-modal-viewport="true"]');
  expect(viewport).toBeTruthy();
  expect(viewport.parentElement).toBe(document.body);
  expect(viewport).toHaveClass('fixed', 'inset-0', 'z-[1000]');
  expect(screen.getByRole('button', { name: 'Close staff form' })).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: 'Close staff form' }));
  expect(screen.queryByRole('dialog', { name: /Add Staff/ })).not.toBeInTheDocument();
});

test('staff form closes with Escape through the shared modal behavior', () => {
  renderPage();
  expect(staffService.getConfiguration).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Add Staff' }));

  expect(screen.getByRole('button', { name: 'Close staff form' })).toBeVisible();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: /Add Staff/ })).not.toBeInTheDocument();
});

test('staff onboarding exposes employment, statutory, salary, and payment fields', () => {
  renderPage();
  fireEvent.click(screen.getByRole('button', { name: 'Add Staff' }));
  fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Ana' } });
  fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'Santos' } });
  fireEvent.change(screen.getByLabelText('Mobile Number'), { target: { value: '09171234567' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ana@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

  expect(screen.getByLabelText('Position')).toBeVisible();
  expect(screen.getByLabelText('Department')).toBeVisible();
  expect(screen.getByLabelText('Monthly Salary')).toBeVisible();
  expect(screen.getByLabelText(/^SSS Number/)).toBeVisible();
  expect(screen.getByLabelText(/^PhilHealth Number/)).toBeVisible();
  expect(screen.getByLabelText(/^Pag-IBIG Number/)).toBeVisible();
  expect(screen.getByLabelText('Salary Payment Method')).toBeVisible();
  expect(screen.getByLabelText(/^Account Number/)).toBeVisible();
});

test('editing staff hides department and position and preserves them by omission', async () => {
  const member = {
    _id: 'staff-1',
    firstName: 'Ana',
    lastName: 'Santos',
    email: 'ana@example.test',
    username: 'ana.santos',
    phone: '09171234567',
    staffType: 'service_staff',
    staffStatus: 'active',
    isActive: true,
    store: { _id: 'store-1', name: 'Main Branch' },
    assignedServices: [],
    employmentProfile: {
      position: 'Service Associate',
      department: 'Operations',
      employmentStatus: 'active',
      dateHired: '2026-01-15'
    },
    payrollProfile: {
      compensationBasis: 'monthly',
      baseRate: 18000,
      effectiveDate: '2026-01-15'
    },
    professionalProfile: { staffId: 'STAFF-001' }
  };
  staffService.getAll.mockImplementation(params => Promise.resolve({
    data: { staff: params?.archived ? [] : [member] }
  }));
  staffService.getConfiguration.mockResolvedValue({
    data: {
      services: [],
      branches: [{ _id: 'store-1', name: 'Main Branch' }],
      availableRoles: ['service_staff'],
      riderVehicleTypes: []
    }
  });
  staffService.update.mockResolvedValue({ data: { staff: member } });

  renderPage();
  fireEvent.change(await screen.findByLabelText('Actions for Ana'), {
    target: { value: 'edit' }
  });

  fireEvent.change(screen.getByLabelText('First Name'), {
    target: { value: 'Anne' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

  expect(screen.queryByLabelText('Position')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Department')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Employment Status')).toBeVisible();
  expect(screen.getByLabelText('Monthly Salary')).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

  await waitFor(() => {
    expect(staffService.update).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: /Edit Staff/ })).not.toBeInTheDocument();
  });
  const [, payload] = staffService.update.mock.calls[0];
  expect(payload.firstName).toBe('Anne');
  expect(payload.employmentProfile).not.toHaveProperty('position');
  expect(payload.employmentProfile).not.toHaveProperty('department');
});
