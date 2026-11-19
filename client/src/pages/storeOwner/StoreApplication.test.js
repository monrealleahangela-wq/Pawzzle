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
  default: { getUserApplication: jest.fn(), submitApplication: jest.fn(), saveDraft: jest.fn(), submitExpansionRequest: jest.fn(), extractDocument: jest.fn() }
}));
jest.mock('../../components/GoogleMapsLocationPicker', () => ({ onLocationSelected }) => (
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
test('all six required sections remain reachable on the responsive canonical form', async () => {
  render(<StoreApplication />);
  await waitFor(() => expect(storeApplicationService.getUserApplication).toHaveBeenCalled());
  expect(screen.getByRole('heading', { name: /build a trusted pet business/i })).toBeVisible();
  expect(screen.getByText(/what will your store offer/i)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /pet products/i }));
  fireEvent.click(screen.getByRole('button', { name: /business info/i }));
  expect(screen.getByLabelText(/public store name/i)).toBeVisible();
  expect(screen.getByLabelText(/legal business name/i)).toBeVisible();
  expect(screen.getByPlaceholderText(/pawzzle pet supplies/i)).toHaveClass('input-premium');

  expect(screen.getByLabelText(/full legal name/i)).toBeVisible();
  expect(screen.getByLabelText(/representative.*email|email address/i)).toBeVisible();
  expect(screen.getByRole('button', { name: /yes, i have staff/i })).toBeVisible();
  expect(screen.queryByText(/deployed|solo op|operational protocol/i)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /store location/i }));
  expect(screen.getByLabelText(/registration issued by/i)).toBeVisible();
  expect(screen.getByLabelText(/business contact number/i)).toBeVisible();
  expect(screen.getByText(/bir and tax information/i)).toBeVisible();
  const locationHeading = screen.getByRole('heading', { name: /store location/i });
  const locationSection = locationHeading.closest('section');
  expect(locationSection).toContainElement(screen.getByRole('button', { name: /choose on map/i }));
  expect(locationSection).toContainElement(screen.getByRole('button', { name: /enter address/i }));
  expect(locationSection).toContainElement(screen.getByRole('button', { name: /confirm test location/i }));
  expect(locationSection.parentElement).toHaveClass('md:grid-cols-2');
  expect(locationSection.parentElement.children).toHaveLength(2);

  fireEvent.click(screen.getByRole('button', { name: /documents/i }));
  expect(screen.getByText(/dti certificate or sec\/cda registration/i)).toBeVisible();
  expect(screen.getByText(/bir certificate of registration \(form 2303\)/i)).toBeVisible();
  expect(screen.getByText(/store payout details/i)).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: /review & submit/i }));
  expect(screen.getByLabelText(/your full legal name/i)).toBeVisible();
  const declarationCheckbox = screen.getByRole('checkbox', { name: /i confirm that all information/i });
  expect(declarationCheckbox).toHaveClass('mt-0.5');
  expect(declarationCheckbox.nextElementSibling).toHaveClass('flex-1', 'leading-5');
  expect(screen.getByRole('button', { name: /submit application for review/i })).toBeVisible();
});

test('rejected application reopens with every nested persisted section prepopulated', async () => {
  storeApplicationService.getUserApplication.mockResolvedValue({ data: { application: {
    _id: 'application-1', status: 'rejected', businessName: 'Saved Store', registeredBusinessName: 'Saved Store OPC',
    businessType: 'pet_store', legalStructure: 'one_person_corporation', natureOfBusiness: 'Pet supplies',
    businessDescription: 'Saved description', businessCategories: ['pet_products'], operationalModules: ['products'],
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
  fireEvent.click(screen.getByRole('button', { name: /business info/i }));
  expect(screen.getByLabelText(/public store name/i)).toHaveValue('Saved Store');
  expect(screen.getByLabelText(/legal business name/i)).toHaveValue('Saved Store OPC');
  expect(screen.getByLabelText(/full legal name/i)).toHaveValue('Saved Owner');
});

test('an uploaded registration image auto-fills reviewable OCR values', async () => {
  storeApplicationService.extractDocument.mockResolvedValue({ data: { extraction: { fields: {
    'businessRegistration.certificateNumber': { value: 'DTI-2027-100', confidence: 99 },
    'businessRegistration.registeredName': { value: 'Pawzzle OCR Trading', confidence: 98 },
    'businessRegistration.expirationDate': { value: '2032-11-18', confidence: 96 }
  } } } });

  const { container } = render(<StoreApplication />);
  await waitFor(() => expect(storeApplicationService.getUserApplication).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: /documents/i }));
  const input = container.querySelector('input[data-field="businessRegistration"]');
  fireEvent.change(input, { target: { files: [new File(['image'], 'dti.png', { type: 'image/png' })] } });
  await waitFor(() => expect(storeApplicationService.extractDocument).toHaveBeenCalledWith(expect.any(File), 'business_registration', expect.any(Object)));
  await screen.findByText(/3 fields suggested/i);

  fireEvent.click(screen.getByRole('button', { name: /store location/i }));
  expect(screen.getByLabelText(/registration or certificate number/i)).toHaveValue('DTI-2027-100');
  expect(screen.getByLabelText(/^expiration date/i)).toHaveValue('2032-11-18');
});
