import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProductDetail from './ProductDetail';
import { productService, socialService } from '../../services/apiService';

jest.mock('../../services/apiService', () => ({
  productService: { getProductById: jest.fn() },
  socialService: { checkFavoriteStatus: jest.fn(), toggleFavorite: jest.fn() },
  getImageUrl: value => value
}));
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'customer-1', role: 'customer' }, isAuthenticated: true })
}));
jest.mock('../../contexts/CartContext', () => ({
  useCart: () => ({ addToCart: jest.fn(), buyNow: jest.fn() })
}));
jest.mock('../../components/LoginModal', () => () => null);
jest.mock('../../components/ReviewSection', () => () => null);

test('dog-only legacy food does not display as suitable for all pets', async () => {
  productService.getProductById.mockResolvedValue({
    data: {
      product: {
        _id: 'product-1',
        name: 'PuppyGrow Chicken Formula',
        category: 'Pet Food',
        description: 'Complete puppy nutrition.',
        price: 280,
        brand: 'PuppyGrow',
        images: [],
        suitableFor: [],
        stockQuantity: 5
      }
    }
  });
  socialService.checkFavoriteStatus.mockResolvedValue({ data: { isFavorite: false } });

  render(
    <MemoryRouter initialEntries={['/products/product-1']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/products/:id" element={<ProductDetail />} />
      </Routes>
    </MemoryRouter>
  );

  expect(await screen.findByText('Dogs')).toBeInTheDocument();
  expect(screen.queryByText('All pets')).not.toBeInTheDocument();
});
