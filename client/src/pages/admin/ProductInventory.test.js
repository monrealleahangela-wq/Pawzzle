import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProductInventory from './ProductInventory';
import { adminProductService, inventoryService } from '../../services/apiService';

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
  render(<MemoryRouter><ProductInventory /></MemoryRouter>);

  expect(screen.getByRole('heading', { name: /Product Inventory/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Update Stock/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Add Product$/i })).not.toBeInTheDocument();
});

test('out-of-stock inventory orders from suppliers instead of opening manual adjustment', async () => {
  const product = { _id: 'product-1', name: 'Cap', sku: 'CAP-1', category: 'Pet Accessories', stockQuantity: 0, images: [] };
  adminProductService.getAllProducts.mockResolvedValue({
    data: { products: [product], pagination: { currentPage: 1, totalPages: 1 } }
  });
  inventoryService.adminGetInventory.mockResolvedValue({
    data: {
      inventory: [{ product, quantity: 0, reorderLevel: 10, inventoryId: 'inventory-1' }],
      summary: { totalItems: 1, lowStockItems: 0, outOfStockItems: 1, totalValue: 0 },
      pagination: { currentPage: 1, totalPages: 1 }
    }
  });

  render(<MemoryRouter><ProductInventory /></MemoryRouter>);
  fireEvent.click(screen.getByRole('tab', { name: /Inventory Status/i }));

  const restockLink = await screen.findByRole('link', { name: 'Order new stock for Cap' });
  expect(restockLink).toHaveTextContent('Order New Stock');
  expect(restockLink).toHaveAttribute('href', '/admin/purchase-orders?tab=suppliers&restockProduct=product-1');
  expect(screen.queryByRole('button', { name: 'Adjust Stock' })).not.toBeInTheDocument();
});
