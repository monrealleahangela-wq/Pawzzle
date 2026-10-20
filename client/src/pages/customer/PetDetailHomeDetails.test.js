import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PetDetail from './PetDetail';
import { petService, storeService } from '../../services/apiService';

jest.mock('../../services/apiService', () => ({
  petService: { getPetById: jest.fn() },
  storeService: { getStoreDetails: jest.fn() },
  paymentService: {}, adoptionService: {}, getImageUrl: value => value
}));
jest.mock('../../services/chatService', () => ({ chatService: {} }));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: false, user: null }) }));
jest.mock('../../components/LoginModal', () => () => null);
jest.mock('../../components/EnhancedChatMessenger', () => () => null);
jest.mock('../../components/PetPurchaseModal', () => () => null);
jest.mock('../../components/ReviewSection', () => () => null);

const pet = homeDetails => ({
  _id: '507f1f77bcf86cd799439013', name: 'Milo', species: 'bird', breed: 'Mixed',
  age: 2, ageUnit: 'years', gender: 'male', size: 'small', price: 5000,
  description: 'A pet listing with seller-provided care requirements.',
  vaccinationStatus: 'none', status: 'available', isAvailable: true, images: [],
  store: { _id: '507f1f77bcf86cd799439012', name: 'Visible Store' },
  homeDetails
});
const renderDetail = async homeDetails => {
  petService.getPetById.mockResolvedValue({ data: { pet: pet(homeDetails) } });
  storeService.getStoreDetails.mockResolvedValue({ data: { store: pet().store, pets: [], services: [] } });
  render(<MemoryRouter initialEntries={['/pets/507f1f77bcf86cd799439013']}>
    <Routes><Route path="/pets/:id" element={<PetDetail />} /></Routes>
  </MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Milo' })).toBeInTheDocument());
};

test('customer sees only populated seller-provided Home Details', async () => {
  await renderDetail({ enclosureLengthCm: 80, ventilationNotes: 'Well ventilated', indoor: 'conditional' });
  expect(screen.getByRole('heading', { name: 'Home Details' })).toBeInTheDocument();
  expect(screen.getByText(/Seller-provided requirements/i)).toBeInTheDocument();
  expect(screen.getByText('80 cm')).toBeInTheDocument();
  expect(screen.getByText('Well ventilated')).toBeInTheDocument();
  expect(screen.queryByText('Minimum aquarium volume')).not.toBeInTheDocument();
});

test('legacy pets do not show invented Home Details', async () => {
  await renderDetail(undefined);
  expect(screen.queryByRole('heading', { name: 'Home Details' })).not.toBeInTheDocument();
});
