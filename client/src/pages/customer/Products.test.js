import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Products from './Products';
import { dssService, productService } from '../../services/apiService';

jest.mock('../../services/apiService', () => ({
  productService: { getAllProducts: jest.fn() },
  dssService: { getProductRecommendations: jest.fn() },
  getImageUrl: value => value
}));
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'customer' }, isAuthenticated: true })
}));
jest.mock('../../contexts/CartContext', () => ({
  useCart: () => ({ addToCart: jest.fn(), buyNow: jest.fn() })
}));
jest.mock('../../constants/locationConstants', () => ({
  getCitiesByProvince: () => []
}));
jest.mock('../../components/LoginModal', () => () => null);

const emptyResponse = {
  data: {
    products: [],
    pagination: { currentPage: 1, totalPages: 1, hasNext: false, hasPrev: false }
  }
};

const renderProducts = () => render(
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Products />
  </MemoryRouter>
);

beforeEach(() => {
  productService.getAllProducts.mockReset();
  dssService.getProductRecommendations.mockReset();
  dssService.getProductRecommendations.mockResolvedValue({
    data: { status: 'no_pet_profiles', budget: 1000, petProfiles: [], recommendations: [] }
  });
});

test('Customer Product categories use canonical values and send the selected category to the API', async () => {
  productService.getAllProducts.mockResolvedValue(emptyResponse);
  renderProducts();

  await waitFor(() => expect(productService.getAllProducts).toHaveBeenCalled());
  const categorySelect = (await screen.findAllByRole('combobox')).find(select => (
    within(select).queryByRole('option', { name: 'Pet Accessories' })
  ));
  expect(categorySelect).toBeDefined();
  expect(within(categorySelect).getAllByRole('option').map(option => option.value)).toEqual([
    '', 'Pet Food', 'Pet Accessories', 'Pet Clothing and Accessories', 'Pet Health Care', 'Others'
  ]);

  fireEvent.change(categorySelect, { target: { value: 'Pet Accessories' } });
  await waitFor(() => expect(productService.getAllProducts).toHaveBeenLastCalledWith(
    expect.objectContaining({ category: 'Pet Accessories', page: 1 })
  ));
});

test('Customer Product API failures render an error state instead of the empty catalog state', async () => {
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  productService.getAllProducts.mockRejectedValue({ response: { data: { message: 'Catalog unavailable' } } });
  renderProducts();

  expect(await screen.findByText('Unable to load products')).toBeInTheDocument();
  expect(screen.getByText('Catalog unavailable')).toBeInTheDocument();
  expect(screen.queryByText("We couldn't find any products")).not.toBeInTheDocument();
  consoleError.mockRestore();
});

test('Customer marketplace never renders a zero-stock product returned by the API', async () => {
  productService.getAllProducts.mockResolvedValue({
    data: {
      products: [
        { _id: 'available', name: 'Available Food', category: 'Pet Food', price: 120, stockQuantity: 2, images: [], store: { _id: 'store-1', name: 'Pawzzle' } },
        { _id: 'depleted', name: 'Depleted Food', category: 'Pet Food', price: 95, stockQuantity: 0, images: [], store: { _id: 'store-1', name: 'Pawzzle' } }
      ],
      pagination: { currentPage: 1, totalPages: 1, hasNext: false, hasPrev: false }
    }
  });

  renderProducts();

  expect(await screen.findByText('Available Food')).toBeInTheDocument();
  expect(screen.queryByText('Depleted Food')).not.toBeInTheDocument();
});

test('Customer sees personalized product suggestions and can change budget and category', async () => {
  productService.getAllProducts.mockResolvedValue(emptyResponse);
  dssService.getProductRecommendations.mockResolvedValue({
    data: {
      status: 'ready',
      budget: 1000,
      petProfiles: [{ _id: 'pet-1', name: 'Milo', type: 'dog', breed: 'Beagle' }],
      recommendations: [{
        product: { _id: 'food-1', name: 'Milo Puppy Food', category: 'Pet Food', price: 450, stockQuantity: 8, images: [] },
        score: 100,
        reasons: ['Suitable for dog', 'Within the ₱1,000 budget', 'Matched to Milo']
      }],
      disclaimer: 'Suggestions are not veterinary advice.'
    }
  });

  renderProducts();

  expect(await screen.findByRole('heading', { name: 'Personalized Product Recommendations' })).toBeInTheDocument();
  expect(await screen.findByText('Milo Puppy Food')).toBeInTheDocument();
  expect(screen.getByText('100% match')).toBeInTheDocument();
  expect(dssService.getProductRecommendations).toHaveBeenCalledWith({ budget: 1000, category: 'all' });

  fireEvent.change(screen.getByLabelText('Maximum budget per item'), { target: { value: '500' } });
  await waitFor(() => expect(dssService.getProductRecommendations).toHaveBeenLastCalledWith({ budget: 500, category: 'all', petProfileId: 'pet-1' }));

  fireEvent.change(screen.getByLabelText('Recommendation category'), { target: { value: 'toys' } });
  await waitFor(() => expect(dssService.getProductRecommendations).toHaveBeenLastCalledWith({ budget: 500, category: 'toys', petProfileId: 'pet-1' }));
});
