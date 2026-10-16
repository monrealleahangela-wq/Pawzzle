import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import StoreApplication from './StoreApplication';
import storeApplicationService from '../../services/storeApplicationService';

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'customer', firstName: 'Store', lastName: 'Owner', email: 'owner@example.com' }, updateUser: jest.fn() })
}));
jest.mock('../../services/storeApplicationService', () => ({
  __esModule: true,
  default: { getUserApplication: jest.fn(), submitApplication: jest.fn(), submitExpansionRequest: jest.fn() }
}));
jest.mock('../../components/MapPicker', () => ({ onLocationSelected }) => (
  <button type="button" onClick={() => onLocationSelected({ street: 'Main', city: 'Dasmarinas', barangay: 'San Jose', zipCode: '4114', lat: 14.3, lng: 120.9 })}>
    Confirm test location
  </button>
));
jest.mock('../../constants/locationConstants', () => ({
  getCitiesByProvince: () => [{ value: 'dasmarinas', label: 'Dasmarinas' }],
  getBarangaysByCity: () => [{ value: 'san_jose', label: 'San Jose' }]
}));
jest.mock('react-toastify', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
  storeApplicationService.getUserApplication.mockResolvedValue({ data: { application: null } });
});
test('all required sections remain reachable on the responsive canonical form', async () => {
  render(<StoreApplication />);
  await waitFor(() => expect(storeApplicationService.getUserApplication).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: /initialize onboarding/i }));
  expect(screen.getByLabelText(/store name/i)).toBeVisible();
  expect(screen.getByLabelText(/registered business name/i)).toBeVisible();
  expect(screen.getByText(/what do you sell/i)).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: /owner & team/i }));
  expect(screen.getByLabelText(/full legal name/i)).toBeVisible();
  expect(screen.getByLabelText(/representative.*email|email address/i)).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: /location & tax/i }));
  expect(screen.getByLabelText(/registration authority/i)).toBeVisible();
  expect(screen.getByLabelText(/primary contact number/i)).toBeVisible();
  expect(screen.getByText(/bir \/ tax information/i)).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: /documents/i }));
  expect(screen.getByText(/dti \/ sec certificate/i)).toBeVisible();
  expect(screen.getByText(/bir form 2303/i)).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: /review/i }));
  expect(screen.getAllByPlaceholderText(/contact name/i)).toHaveLength(2);
  expect(screen.getByLabelText(/applicant full name/i)).toBeVisible();
});

test('rejected application reopens with every nested persisted section prepopulated', async () => {
  storeApplicationService.getUserApplication.mockResolvedValue({ data: { application: {
    _id: 'application-1', status: 'rejected', businessName: 'Saved Store', registeredBusinessName: 'Saved Store OPC',
    businessType: 'pet_store', legalStructure: 'one_person_corporation', natureOfBusiness: 'Pet supplies',
    businessDescription: 'Saved description', operationalModules: ['products'],
    staffingConfiguration: { hasStaff: 'yes', staffQuantityRange: '6-15' },
    representative: { fullName: 'Saved Owner', role: 'Owner', phone: '0917', email: 'saved@example.com' },
    businessRegistration: { authority: 'sec', certificateNumber: 'SEC-1', registeredName: 'Saved Store OPC' },
    contactInfo: { phone: '0917', email: 'store@example.com', address: { street: 'Saved Street', barangay: 'San Jose', city: 'dasmarinas', province: 'Cavite', zipCode: '4114', coordinates: { lat: 14.3, lng: 120.9 } } },
    taxProfile: { birRegistrationStatus: 'not_registered', registeredAddress: {} },
    references: [{ name: 'One', business: 'One', phone: '1', email: 'one@example.com' }, { name: 'Two', business: 'Two', phone: '2', email: 'two@example.com' }],
    documentAvailability: { businessRegistration: true }
  } } });

  render(<StoreApplication />);
  fireEvent.click(await screen.findByRole('button', { name: /re-apply with corrected documents/i }));
  fireEvent.click(screen.getByRole('button', { name: /business/i }));
  expect(screen.getByLabelText(/store name/i)).toHaveValue('Saved Store');
  expect(screen.getByLabelText(/registered business name/i)).toHaveValue('Saved Store OPC');
  fireEvent.click(screen.getByRole('button', { name: /owner & team/i }));
  expect(screen.getByLabelText(/full legal name/i)).toHaveValue('Saved Owner');
});
