import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    getVariantCapabilities: jest.fn(),
    updateProduct: jest.fn(),
    deleteProduct: jest.fn()
  },
  inventoryService: { adminGetInventory: jest.fn(), getAdjustmentRequests: jest.fn(), createAdjustmentRequest: jest.fn(), reviewAdjustmentRequest: jest.fn() },
  uploadService: { uploadMultipleImages: jest.fn(), uploadDocument: jest.fn() },
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
  adminProductService.getVariantCapabilities.mockResolvedValue({ data: { enabled: false, reasons: ['test gate'] } });
  inventoryService.getAdjustmentRequests.mockResolvedValue({ data: { requests: [], canReview: true } });
});

test('store inventory keeps stock management but has no manual product creation action', () => {
  render(<MemoryRouter><ProductInventory /></MemoryRouter>);

  expect(screen.getByRole('heading', { name: /Product Inventory/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Update Stock/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Add Product$/i })).not.toBeInTheDocument();
});

test('general stock action loads inventory products even while product catalog is active', async () => {
  const product = { _id: 'product-selector-1', name: 'Cat Food', sku: 'CAT-1', category: 'Pet Food', images: [] };
  inventoryService.adminGetInventory.mockResolvedValue({
    data: {
      inventory: [{ product, quantity: 7, reorderLevel: 2, inventoryId: 'inventory-selector-1' }],
      summary: { totalItems: 1, lowStockItems: 0, outOfStockItems: 0, totalValue: 0 },
      pagination: { currentPage: 1, totalPages: 1 }
    }
  });

  render(<MemoryRouter><ProductInventory /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: /Update Stock/i }));

  expect(screen.getByRole('dialog', { name: 'Inventory action' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Close stock update/i })).toBeInTheDocument();
  await waitFor(() => expect(inventoryService.adminGetInventory).toHaveBeenCalledWith({ page: 1, limit: 500 }));
  expect(await screen.findByRole('option', { name: /Cat Food.*7 in stock/i })).toHaveValue('product-selector-1');
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

test('in-stock inventory opens compact supplier-order and stock-loss workflow', async () => {
  const product = { _id: 'product-2', name: 'Dog Food', sku: 'DOG-1', category: 'Pet Food', stockQuantity: 8, images: [] };
  adminProductService.getAllProducts.mockResolvedValue({ data: { products: [product], pagination: { currentPage: 1, totalPages: 1 } } });
  inventoryService.adminGetInventory.mockResolvedValue({
    data: {
      inventory: [{ product, quantity: 8, reorderLevel: 3, inventoryId: 'inventory-2' }],
      summary: { totalItems: 8, lowStockItems: 0, outOfStockItems: 0, totalValue: 0 },
      pagination: { currentPage: 1, totalPages: 1 }
    }
  });

  render(<MemoryRouter><ProductInventory /></MemoryRouter>);
  fireEvent.click(screen.getByRole('tab', { name: /Inventory Status/i }));
  fireEvent.click(await screen.findByRole('button', { name: 'Adjust Stock' }));

  expect(screen.getByRole('dialog', { name: 'Inventory action' })).toBeInTheDocument();
  expect(screen.getByText('Need more stock?')).toBeInTheDocument();
  expect(screen.getByText('Report stock loss')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Reduce Stock Now/i })).toBeInTheDocument();
});
