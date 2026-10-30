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
  expect(screen.getByRole('heading', { name: /build a trusted pet business/i })).toBeVisible();
  expect(screen.getAllByText(/dti or sec registration/i).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: /start business details/i }));
  expect(screen.getByLabelText(/public store name/i)).toBeVisible();
  expect(screen.getByLabelText(/legal business name/i)).toBeVisible();
  expect(screen.getByText(/what will your store offer/i)).toBeVisible();
  expect(screen.getByPlaceholderText(/pawzzle pet supplies/i)).toHaveClass('input-premium');

  fireEvent.click(screen.getByRole('button', { name: /owner & team/i }));
  expect(screen.getByLabelText(/full legal name/i)).toBeVisible();
  expect(screen.getByLabelText(/representative.*email|email address/i)).toBeVisible();
  expect(screen.getByRole('button', { name: /yes, i have staff/i })).toBeVisible();
  expect(screen.queryByText(/deployed|solo op|operational protocol/i)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /location & tax/i }));
  expect(screen.getByLabelText(/registration issued by/i)).toBeVisible();
  expect(screen.getByLabelText(/business contact number/i)).toBeVisible();
  expect(screen.getByText(/bir and tax information/i)).toBeVisible();
  expect(screen.getByRole('button', { name: /choose on map/i })).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: /documents/i }));
  expect(screen.getByText(/dti \/ sec certificate/i)).toBeVisible();
  expect(screen.getByText(/bir form 2303/i)).toBeVisible();
  expect(screen.getByText(/store payout details/i)).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: /^review references and declaration$/i }));
  expect(screen.getAllByPlaceholderText(/person's full name/i)).toHaveLength(2);
  expect(screen.getByLabelText(/your full legal name/i)).toBeVisible();
  const declarationCheckbox = screen.getByRole('checkbox', { name: /i confirm the information is correct/i });
  expect(declarationCheckbox).toHaveClass('mt-0.5');
  expect(declarationCheckbox.nextElementSibling).toHaveClass('flex-1', 'leading-5');
  expect(screen.getByRole('button', { name: /submit application for review/i })).toBeVisible();
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
  fireEvent.click(screen.getByRole('button', { name: /^business store identity$/i }));
  expect(screen.getByLabelText(/public store name/i)).toHaveValue('Saved Store');
  expect(screen.getByLabelText(/legal business name/i)).toHaveValue('Saved Store OPC');
  fireEvent.click(screen.getByRole('button', { name: /owner & team/i }));
  expect(screen.getByLabelText(/full legal name/i)).toHaveValue('Saved Owner');
});
