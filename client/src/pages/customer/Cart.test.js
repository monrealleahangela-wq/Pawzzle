import React from 'react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import Cart from './Cart';
import { useCart } from '../../contexts/CartContext';

jest.mock('../../contexts/CartContext', () => ({ useCart: jest.fn() }));
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true })
}));
jest.mock('../../services/apiService', () => ({
  petService: { getPetById: jest.fn() },
  getImageUrl: value => value
}));

const product = {
  itemId: 'product-1',
  itemType: 'product',
  name: 'Dog Food',
  price: 500,
  quantity: 1,
  selected: true,
  image: null,
  storeId: 'store-1',
  storeName: 'Pawzzle Store'
};

test('shows the Product store and links it to the public customer Store profile', () => {
  useCart.mockReturnValue({
    items: [product],
    removeFromCart: jest.fn(),
    updateQuantity: jest.fn(),
    getTotalPrice: () => 500,
    clearCart: jest.fn(),
    toggleItemSelection: jest.fn(),
    selectAllItems: jest.fn(),
    deselectAllItems: jest.fn(),
    getSelectedItems: () => [product]
  });

  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Cart />
    </MemoryRouter>
  );

  expect(screen.getByRole('link', { name: 'View Pawzzle Store store' }))
    .toHaveAttribute('href', '/stores/store-1');
});
