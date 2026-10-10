import React from 'react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import Cart from './Cart';
import { useCart } from '../../contexts/CartContext';
import { petService } from '../../services/apiService';

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

const pet = {
  itemId: 'pet-1',
  itemType: 'pet',
  name: 'Milo',
  price: 7500,
  quantity: 1,
  selected: true,
  image: null,
  storeId: 'store-1',
  storeName: 'Pawzzle Store'
};

const cartState = (items = [product], overrides = {}) => ({
  items,
  removeFromCart: jest.fn(),
  updateQuantity: jest.fn(),
  getTotalPrice: () => items.reduce((sum, item) => sum + (item.selected ? item.price * item.quantity : 0), 0),
  clearCart: jest.fn(),
  toggleItemSelection: jest.fn(),
  selectAllItems: jest.fn(),
  deselectAllItems: jest.fn(),
  getSelectedItems: () => items.filter(item => item.selected),
  ...overrides
});

const renderCart = () => render(
  <MemoryRouter initialEntries={['/cart']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes>
      <Route path="/cart" element={<Cart />} />
      <Route path="/checkout" element={<div>Checkout destination</div>} />
    </Routes>
  </MemoryRouter>
);

beforeEach(() => {
  jest.clearAllMocks();
});

test('uses a compact responsive cart layout and content-driven summary', () => {
  useCart.mockReturnValue(cartState());

  renderCart();

  expect(screen.getByRole('heading', { name: 'Shopping Cart' })).toHaveClass('!text-2xl', 'sm:!text-3xl');
  expect(screen.getByText('Review your selected items before checkout.')).toHaveClass('text-sm', 'leading-relaxed');
  expect(screen.getByTestId('cart-layout')).toHaveClass('grid-cols-1', 'lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]');
  expect(screen.getByTestId('cart-items-list')).toHaveClass('min-w-0');
  expect(screen.getByTestId('order-summary')).not.toHaveClass('hidden');
  expect(screen.getByTestId('order-summary')).toHaveClass('min-w-0');
  expect(screen.getByTestId('cart-item-product')).toHaveClass('p-3', 'sm:p-4');
  expect(screen.getByRole('button', { name: 'Checkout (1)' })).toHaveClass('min-h-12');
  expect(screen.queryByText('Selected total')).not.toBeInTheDocument();
});

test('preserves Product selection, quantity, removal, cart actions, Store link, and checkout navigation', () => {
  const twoProducts = [{ ...product, quantity: 2 }];
  const state = cartState(twoProducts);
  useCart.mockReturnValue(state);

  renderCart();

  expect(screen.getByRole('link', { name: 'View Pawzzle Store store' }))
    .toHaveAttribute('href', '/stores/store-1');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Dog Food' }));
  expect(state.toggleItemSelection).toHaveBeenCalledWith('product-1', 'product');
  fireEvent.click(screen.getByRole('button', { name: 'Increase Dog Food quantity' }));
  expect(state.updateQuantity).toHaveBeenCalledWith('product-1', 'product', 3);
  fireEvent.click(screen.getByRole('button', { name: 'Remove Dog Food from cart' }));
  expect(state.removeFromCart).toHaveBeenCalledWith('product-1', 'product');
  fireEvent.click(screen.getByRole('button', { name: 'Select All' }));
  expect(state.selectAllItems).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Clear Cart' }));
  expect(state.clearCart).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Checkout (1)' }));
  expect(screen.getByText('Checkout destination')).toBeInTheDocument();
});

test('keeps Pet cart rows compact and quantity-locked to one', async () => {
  let resolveAvailability;
  petService.getPetById.mockImplementation(() => new Promise(resolve => { resolveAvailability = resolve; }));
  useCart.mockReturnValue(cartState([pet]));

  renderCart();

  await act(async () => resolveAvailability({ data: { pet: { isAvailable: true } } }));
  expect(petService.getPetById).toHaveBeenCalledWith('pet-1');
  const petRow = screen.getByTestId('cart-item-pet');
  expect(within(petRow).getByText('1 individual pet')).toBeInTheDocument();
  expect(within(petRow).queryByRole('button', { name: /quantity/i })).not.toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Select Milo' })).toBeChecked();
});
