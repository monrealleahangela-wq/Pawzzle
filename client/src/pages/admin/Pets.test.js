import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminPets from './Pets';
import { adminPetService } from '../../services/apiService';
import { toast } from 'react-toastify';

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'admin' } })
}));

jest.mock('../../utils/authorization', () => ({
  PLATFORM_ADMIN_ROLES: new Set(['super_admin']),
  STORE_ADMIN_ROLES: new Set(['admin']),
  hasUiActionPermission: () => true
}));

jest.mock('../../services/apiService', () => ({
  adminPetService: {
    getAllPets: jest.fn(),
    getPetById: jest.fn(),
    deletePet: jest.fn()
  },
  uploadService: {},
  adoptionService: { getMyRequests: jest.fn(), updateAdoptionStatus: jest.fn() },
  getImageUrl: value => value
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() }
}));

jest.mock('../../components/pets/PetListingFormModal', () => () => <div data-testid="pet-listing-form" />);

const pet = {
  _id: '507f1f77bcf86cd799439011',
  name: 'Milo',
  species: 'dog',
  breed: 'Mixed',
  gender: 'male',
  age: 2,
  ageUnit: 'years',
  price: 5000,
  status: 'available',
  isAvailable: true,
  vaccinationStatus: 'complete',
  images: ['/milo.jpg'],
  pcciRegistration: { status: 'not_sure' }
};

beforeEach(() => {
  jest.clearAllMocks();
  adminPetService.getAllPets.mockResolvedValue({
    data: { pets: [pet], pagination: { currentPage: 1, totalPages: 1, hasNext: false, hasPrev: false } }
  });
  adminPetService.getPetById.mockResolvedValue({ data: { pet } });
  adminPetService.deletePet.mockResolvedValue({ data: {} });
});

test('seller Pet cards expose only Edit and Delete actions', async () => {
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AdminPets /></MemoryRouter>);

  await screen.findByText('Milo');
  expect(screen.queryByTitle('Duplicate shared listing details')).not.toBeInTheDocument();

  expect(screen.getByTestId('pet-management-header')).toHaveClass('p-4');
  expect(screen.getByRole('button', { name: /Add New Pet/i })).toHaveClass('h-11');
  expect(screen.getByRole('tab', { name: /Pet Listings/i })).toHaveClass('h-10');
  expect(screen.getByRole('tab', { name: /Sale History/i })).toHaveClass('h-10');
  expect(screen.getByTestId('pet-filter-panel')).toHaveClass('p-3');
  expect(screen.getByRole('textbox', { name: 'Search pets' })).toHaveClass('h-11');
  expect(screen.getByRole('combobox', { name: 'Species' })).toHaveClass('h-11');
  expect(screen.getByRole('combobox', { name: 'Size' })).toHaveClass('h-11');
  expect(screen.getByRole('combobox', { name: 'Gender' })).toHaveClass('h-11');
  expect(screen.getByRole('combobox', { name: 'Availability' })).toHaveClass('h-11');
  expect(screen.getByTestId('pet-grid')).toHaveClass('[--card-min:13.5rem]');
  expect(screen.getByTestId('pet-card-media')).toHaveClass('aspect-[4/3]');
  expect(screen.getByRole('img', { name: 'Milo' })).toHaveClass('object-cover');
  expect(screen.getByTitle('Edit Pet')).toHaveClass('h-10', 'w-10');
  expect(screen.getByTitle('Delete Pet')).toHaveClass('h-10', 'w-10');

  fireEvent.click(screen.getByTitle('Edit Pet'));
  await waitFor(() => expect(adminPetService.getPetById).toHaveBeenCalledWith(pet._id));

  fireEvent.click(screen.getByTitle('Delete Pet'));
  await waitFor(() => expect(adminPetService.deletePet).toHaveBeenCalledWith(pet._id));

  expect(toast.info).not.toHaveBeenCalled();
  confirm.mockRestore();
});
