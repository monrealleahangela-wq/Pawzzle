import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Products from './Products';
import { productService } from '../../services/apiService';

jest.mock('../../services/apiService', () => ({
  productService: { getAllProducts: jest.fn() },
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
