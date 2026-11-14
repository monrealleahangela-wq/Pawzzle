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
    create: jest.fn(),
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

test('new rider onboarding includes capacity but omits position and department', async () => {
  staffService.getAll.mockResolvedValue({ data: { staff: [] } });
  staffService.getConfiguration.mockResolvedValue({
    data: {
      services: [],
      branches: [{ _id: 'store-1', name: 'Main Branch' }],
      availableRoles: ['delivery_rider'],
      riderVehicleTypes: ['motorcycle'],
      nextStaffId: 'STAFF-002'
    }
  });
  staffService.create.mockResolvedValue({ data: { emailSent: true } });

  renderPage();
  await screen.findByText('No staff match these filters.');
  fireEvent.click(screen.getByRole('button', { name: 'Add Staff' }));
  fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Rico' } });
  fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'Santos' } });
  fireEvent.change(screen.getByLabelText('Mobile Number'), { target: { value: '09171234567' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'rico@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

  fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'delivery_rider' } });

  expect(screen.queryByLabelText('Position')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Department')).not.toBeInTheDocument();
  expect(screen.getByLabelText(/^Maximum load \(kg\)/)).toBeVisible();
  expect(screen.getByLabelText(/^Maximum parcels/)).toBeVisible();
  expect(screen.getByLabelText("Driver's License")).toBeVisible();
  expect(screen.getByLabelText('Vehicle Type')).toBeVisible();

  fireEvent.change(screen.getByLabelText('Monthly Salary'), { target: { value: '18000' } });
  fireEvent.change(screen.getByLabelText("Driver's License"), { target: { value: 'DL-101' } });
  fireEvent.change(screen.getByLabelText('Vehicle Type'), { target: { value: 'motorcycle' } });
  fireEvent.change(screen.getByLabelText('Plate Number'), { target: { value: 'ABC 124' } });
  fireEvent.change(screen.getByLabelText(/^Maximum load \(kg\)/), { target: { value: '20' } });
  fireEvent.change(screen.getByLabelText(/^Maximum parcels/), { target: { value: '4' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'rider.rico' } });
  const temporaryPassword = screen.getByLabelText(/^Temporary Password/);
  expect(temporaryPassword).toHaveAttribute('type', 'password');
  fireEvent.click(screen.getByRole('button', { name: 'Show temporary password' }));
  expect(temporaryPassword).toHaveAttribute('type', 'text');
  fireEvent.click(screen.getByRole('button', { name: 'Hide temporary password' }));
  expect(temporaryPassword).toHaveAttribute('type', 'password');
  fireEvent.change(temporaryPassword, { target: { value: 'TempPass1!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Staff' }));

  await waitFor(() => {
    expect(staffService.create).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: /Add Staff/ })).not.toBeInTheDocument();
  });
  await screen.findByText('No staff match these filters.');
  const [payload] = staffService.create.mock.calls[0];
  expect(payload.employmentProfile).not.toHaveProperty('position');
  expect(payload.employmentProfile).not.toHaveProperty('department');
  expect(payload.riderProfile.vehicleCapacity).toEqual({ maxWeightKg: '20', maxParcelCount: '4' });
});

test('editing a rider shows capacity controls inside the staff form', async () => {
  const rider = {
    _id: 'rider-1',
    firstName: 'Rico',
    lastName: 'Santos',
    email: 'rico@example.test',
    username: 'rider.rico',
    phone: '09171234567',
    staffType: 'delivery_rider',
    staffStatus: 'active',
    isActive: true,
    store: { _id: 'store-1', name: 'Main Branch' },
    assignedServices: [],
    employmentProfile: {
      employmentStatus: 'active',
      dateHired: '2026-11-14'
    },
    payrollProfile: {
      compensationBasis: 'monthly',
      baseRate: 18000,
      effectiveDate: '2026-11-14'
    },
    professionalProfile: { staffId: 'STAFF-002' },
    riderProfile: {
      staffId: 'STAFF-002',
      accountStatus: 'active',
      licenseId: 'DL-101',
      vehicleType: 'motorcycle',
      plateNumber: 'ABC 124',
      vehicleCapacity: { maxWeightKg: 20, maxParcelCount: 4 },
      currentLoad: { weightKg: 2, parcelCount: 1 }
    }
  };
  staffService.getAll.mockImplementation(params => Promise.resolve({
    data: { staff: params?.archived ? [] : [rider] }
  }));
  staffService.getConfiguration.mockResolvedValue({
    data: {
      services: [],
      branches: [{ _id: 'store-1', name: 'Main Branch' }],
      availableRoles: ['delivery_rider'],
      riderVehicleTypes: ['motorcycle']
    }
  });

  renderPage();
  fireEvent.change(await screen.findByLabelText('Actions for Rico'), {
    target: { value: 'edit' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

  const dialog = screen.getByRole('dialog', { name: /Edit Staff/ });
  const maximumLoad = screen.getByLabelText(/^Maximum load \(kg\)/);
  const maximumParcels = screen.getByLabelText(/^Maximum parcels/);
  expect(dialog).toContainElement(maximumLoad);
  expect(dialog).toContainElement(maximumParcels);
  expect(maximumLoad).toHaveValue(20);
  expect(maximumParcels).toHaveValue(4);
  expect(screen.getByLabelText('Current Rider capacity')).toBeVisible();
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
  expect(screen.getByLabelText('Monthly Salary')).toHaveValue(18000);
  fireEvent.change(screen.getByLabelText('Monthly Salary'), {
    target: { value: '22500' }
  });

  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

  await waitFor(() => {
    expect(staffService.update).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: /Edit Staff/ })).not.toBeInTheDocument();
  });
  const [, payload] = staffService.update.mock.calls[0];
  expect(payload.firstName).toBe('Anne');
  expect(payload.employmentProfile.compensation.baseRate).toBe('22500');
  expect(payload.employmentProfile).not.toHaveProperty('position');
  expect(payload.employmentProfile).not.toHaveProperty('department');
});
