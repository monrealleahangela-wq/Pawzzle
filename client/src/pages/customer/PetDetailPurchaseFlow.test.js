import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PetDetail from './PetDetail';
import { petService, storeService } from '../../services/apiService';

jest.mock('../../services/apiService', () => ({
  petService: { getPetById: jest.fn(), getPcciCertificateUrl: jest.fn() },
  storeService: { getStoreDetails: jest.fn() },
  adoptionService: { requestAdoption: jest.fn() },
  paymentService: { createAdoptionCheckoutSession: jest.fn(), verifyPayment: jest.fn(), cancelPayment: jest.fn() },
  getImageUrl: value => value
}));
jest.mock('../../services/chatService', () => ({ chatService: { getConversationByPet: jest.fn(), createConversation: jest.fn() } }));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true, user: { _id: 'buyer-1', role: 'customer' } }) }));
jest.mock('../../components/LoginModal', () => () => null);
jest.mock('../../components/ReviewSection', () => () => null);
jest.mock('../../components/EnhancedChatMessenger', () => ({ isOpen, pet, seller }) => isOpen
  ? <div data-testid="seller-chat">{pet._id}:{seller._id}</div>
  : null);
jest.mock('../../components/PetPurchaseModal', () => ({ isOpen, pet, store }) => isOpen
  ? <div data-testid="pet-checkout">{pet._id}:{store._id}</div>
  : null);

beforeEach(() => {
  jest.clearAllMocks();
  petService.getPetById.mockResolvedValue({ data: { pet: {
    _id: 'pet-1', name: 'Pochi', species: 'mouse', breed: 'Fancy Mouse', price: 2800,
    status: 'available', isAvailable: true, listingType: 'sale', paymentConfig: 'full_payment',
    images: [], description: 'Friendly pet.', vaccinationStatus: 'none',
    addedBy: { _id: 'seller-1', firstName: 'Seller' },
    store: { _id: 'store-1', name: 'Pawzzle South' }
  } } });
  storeService.getStoreDetails.mockResolvedValue({ data: {
    store: { _id: 'store-1', name: 'Pawzzle South' },
    pets: [], services: [{ _id: 'service-1', name: 'Grooming' }]
  } });
});

test('sale listing exposes only chat and buy actions and passes the actual pet and seller context', async () => {
  render(<MemoryRouter initialEntries={['/pets/pet-1']}>
    <Routes><Route path="/pets/:id" element={<PetDetail />} /></Routes>
  </MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Pochi' })).toBeInTheDocument());

  expect(screen.getAllByRole('button', { name: 'Chat Store' })).toHaveLength(3);
  expect(screen.getAllByRole('button', { name: 'Buy Now' })).toHaveLength(2);
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Buy Now' })[0]).toBeEnabled());
  expect(screen.queryByRole('button', { name: /Book a Service|Buy \/ Inquire|Inquire/i })).not.toBeInTheDocument();

  fireEvent.click(screen.getAllByRole('button', { name: 'Chat Store' })[0]);
  expect(screen.getByTestId('seller-chat')).toHaveTextContent('pet-1:seller-1');
  fireEvent.click(screen.getAllByRole('button', { name: 'Buy Now' })[0]);
  expect(screen.getByTestId('pet-checkout')).toHaveTextContent('pet-1:store-1');
});
