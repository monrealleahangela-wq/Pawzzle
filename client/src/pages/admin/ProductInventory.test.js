import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import ProductInventory from './ProductInventory';
import { adminProductService } from '../../services/apiService';

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'admin' } })
}));

jest.mock('../../utils/authorization', () => ({
  PLATFORM_ADMIN_ROLES: new Set(['super_admin']),
  STORE_ADMIN_ROLES: new Set(['admin']),
  OPERATIONAL_ROLES: new Set(['inventory_staff']),
  hasUiActionPermission: () => true
}));

jest.mock('../../services/apiService', () => ({
  productService: { getAllProducts: jest.fn() },
  adminProductService: {
    getAllProducts: jest.fn(),
    updateProduct: jest.fn(),
    deleteProduct: jest.fn()
  },
  inventoryService: { adminGetInventory: jest.fn() },
  uploadService: { uploadMultipleImages: jest.fn() },
  getImageUrl: value => value
}));

jest.mock('../../hooks/useRealTimeUpdates', () => ({
  useRealTimeUpdates: () => undefined
}));

jest.mock('../../components/forms/ProductFormModal', () => () => null);

jest.mock('../../utils/pawzzleDialog', () => ({
  pawzzleConfirm: jest.fn()
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn() }
}));

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.setItem('user', JSON.stringify({ role: 'admin' }));
  adminProductService.getAllProducts.mockImplementation(() => new Promise(() => {}));
});

test('store inventory keeps stock management but has no manual product creation action', () => {
  render(<ProductInventory />);

  expect(screen.getByRole('heading', { name: /Product Inventory/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Update Stock/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Add Product$/i })).not.toBeInTheDocument();
});
