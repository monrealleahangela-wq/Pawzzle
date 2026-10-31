import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
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
const mockAddToCart = jest.fn();
const mockBuyNow = jest.fn();
jest.mock('../../contexts/CartContext', () => ({
  useCart: () => ({ addToCart: mockAddToCart, buyNow: mockBuyNow })
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

test('variant product requires an exact available option and adds that identity to cart', async () => {
  mockAddToCart.mockClear();
  productService.getProductById.mockResolvedValue({
    data: {
      product: {
        _id: 'product-variant', productMode: 'variant', name: 'Premium Food', category: 'Pet Food',
        description: 'Variant food.', price: 100, images: [], suitableFor: ['dogs'], stockQuantity: 0,
        store: { _id: 'store-1', name: 'Pawzzle' }
      },
      normalizedVariants: [{
        _id: 'variant-beef', sku: 'BEEF-1KG', price: 145, availableQuantity: 2, inStock: true,
        attributes: [{ code: 'flavor', label: 'Flavor', valueCode: 'beef', valueLabel: 'Beef' }], images: []
      }],
      variantCapabilities: { browsingEnabled: true, purchasingEnabled: true }
    }
  });
  socialService.checkFavoriteStatus.mockResolvedValue({ data: { isFavorite: false } });

  render(
    <MemoryRouter initialEntries={['/products/product-variant']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes><Route path="/products/:id" element={<ProductDetail />} /></Routes>
    </MemoryRouter>
  );

  expect(await screen.findByText('Flavor: Beef')).toBeInTheDocument();
  expect(screen.getAllByText('Select an option').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: /Flavor: Beef/i }));
  fireEvent.click(screen.getAllByRole('button', { name: /add to cart/i })[0]);
  expect(mockAddToCart).toHaveBeenCalledWith(expect.objectContaining({
    itemId: 'product-variant', productVariant: 'variant-beef', price: 145
  }));
});
