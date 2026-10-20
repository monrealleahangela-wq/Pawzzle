import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import StoreManagement from './StoreManagement';
import { storeService } from '../../services/apiService';

const mockRefreshUserRole = jest.fn();

jest.mock('../../services/apiService', () => ({
  storeService: {
    getMyStore: jest.fn(),
    updateStore: jest.fn(),
    createStore: jest.fn(),
    submitVerification: jest.fn()
  },
  uploadService: { uploadImage: jest.fn() },
  getImageUrl: value => value
}));
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ refreshUserRole: mockRefreshUserRole })
}));
jest.mock('../../components/GoogleMap', () => () => null);
jest.mock('../../components/MapPicker', () => () => null);
jest.mock('../../constants/locationConstants', () => ({
  getCitiesByProvince: () => [],
  getBarangaysByCity: () => []
}));
jest.mock('react-toastify', () => ({
  toast: { error: jest.fn(), success: jest.fn() }
}));

const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const businessHours = Object.fromEntries(days.map(day => [day, {
  open: day === 'saturday' ? '10:00' : '09:00',
  close: day === 'saturday' ? '16:00' : '17:00',
  closed: day === 'sunday'
}]));
const store = {
  _id: 'store-1',
  name: 'Pawzzle Care',
  description: 'Care for every pet.',
  businessType: 'pet_store',
  contactInfo: { address: {} },
  socialMedia: {},
  businessHours
};

beforeEach(() => {
  mockRefreshUserRole.mockReset();
  mockRefreshUserRole.mockResolvedValue();
  storeService.getMyStore.mockReset();
  storeService.updateStore.mockReset();
  storeService.submitVerification.mockReset();
  storeService.getMyStore.mockResolvedValue({ data: { store } });
  storeService.updateStore.mockResolvedValue({ data: { store } });
});

test('Business Hours keeps every day and saves labelled non-overlapping time controls', async () => {
  render(<StoreManagement />);

  fireEvent.click(await screen.findByRole('button', { name: 'Business Hours' }));
  expect(screen.getByRole('heading', { name: 'Business Hours' })).toBeInTheDocument();

  days.forEach(day => {
    const dayLabel = day.charAt(0).toUpperCase() + day.slice(1);
    expect(screen.getByRole('article', { name: `${dayLabel} business hours` })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: `${dayLabel} active` })).toHaveProperty('checked', day !== 'sunday');
  });

  const monday = screen.getByRole('article', { name: 'Monday business hours' });
  const start = within(monday).getByLabelText('Monday start time');
  const end = within(monday).getByLabelText('Monday end time');
  expect(start).toHaveValue('09:00');
  expect(end).toHaveValue('17:00');
  expect(start).toHaveClass('w-full', 'min-w-0', 'max-w-full');
  expect(end).toHaveClass('w-full', 'min-w-0', 'max-w-full');

  fireEvent.change(start, { target: { value: '08:30' } });
  fireEvent.change(end, { target: { value: '17:30' } });
  const saveButton = screen.getByRole('button', { name: 'Save Changes' });
  fireEvent.click(saveButton);

  await waitFor(() => expect(storeService.updateStore).toHaveBeenCalledWith(
    'store-1',
    expect.objectContaining({
      businessHours: expect.objectContaining({
        monday: expect.objectContaining({ open: '08:30', close: '17:30', closed: false })
      })
    })
  ));
  await waitFor(() => expect(saveButton).not.toBeDisabled());
});

test('approved verification is read-only while payout details remain editable', async () => {
  const verifiedStore = {
    ...store,
    verificationStatus: 'verified',
    verification: {},
    payoutAccount: { method: 'gcash', number: '' }
  };
  storeService.getMyStore.mockResolvedValue({ data: { store: verifiedStore } });
  storeService.updateStore.mockResolvedValue({ data: { store: verifiedStore } });

  render(<StoreManagement />);

  fireEvent.click(await screen.findByRole('button', { name: 'Trust & Verification' }));

  expect(screen.getByRole('status')).toHaveTextContent('Identity verification approved');
  expect(screen.getAllByText('Approved by Super Admin')).toHaveLength(2);
  expect(screen.queryByLabelText('Upload government ID')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Upload identity selfie')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Submit Verification Bundle' })).not.toBeInTheDocument();

  const payoutDetails = screen.getByPlaceholderText('Enter Account Details...');
  fireEvent.change(payoutDetails, { target: { value: '09171234567 - Pawzzle Care' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

  await waitFor(() => expect(storeService.updateStore).toHaveBeenCalledWith(
    'store-1',
    expect.objectContaining({
      verificationStatus: 'verified',
      payoutAccount: expect.objectContaining({ number: '09171234567 - Pawzzle Care' })
    })
  ));
  expect(storeService.submitVerification).not.toHaveBeenCalled();
});

test('pending verification still offers identity uploads and submission', async () => {
  storeService.getMyStore.mockResolvedValue({
    data: { store: { ...store, verificationStatus: 'pending', verification: {} } }
  });

  render(<StoreManagement />);

  fireEvent.click(await screen.findByRole('button', { name: 'Trust & Verification' }));

  expect(screen.getByLabelText('Upload government ID')).toBeInTheDocument();
  expect(screen.getByLabelText('Upload identity selfie')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Submit Verification Bundle' })).toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
