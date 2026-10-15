import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SupplierDashboard from './SupplierDashboard';
import { supplierService } from '../../services/apiService';

jest.mock('../../services/apiService', () => ({
  supplierService: {
    getDashboard: jest.fn(), getProducts: jest.fn(), getOrders: jest.fn(),
    getPartnerships: jest.fn(), updateProfile: jest.fn()
  },
  uploadService: {}, getImageUrl: value => value
}));
jest.mock('../../components/procurement/SupplierPartnershipPanel', () => () => null);

beforeEach(() => {
  jest.clearAllMocks();
  supplierService.getDashboard.mockResolvedValue({ data: {
    supplier: { _id: 'supplier-1', businessName: 'Synthetic Supplier', status: 'verified',
      partnershipRequired: false, performance: {}, ratings: {} },
    stats: { activeProducts: 0 }, recentOrders: []
  } });
  supplierService.getProducts.mockResolvedValue({ data: { products: [] } });
  supplierService.getOrders.mockResolvedValue({ data: { orders: [] } });
  supplierService.updateProfile.mockResolvedValue({ data: { partnershipRequired: true } });
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => window.confirm.mockRestore());

test('Supplier explicitly opts in to the global partnership requirement', async () => {
  render(<SupplierDashboard />);
  const checkbox = await screen.findByRole('checkbox', { name: 'Require partnership for all Supplier offers' });
  expect(checkbox).not.toBeChecked();
  fireEvent.click(checkbox);
  await waitFor(() => expect(supplierService.updateProfile).toHaveBeenCalledWith({ partnershipRequired: true }));
  await waitFor(() => expect(checkbox).toBeChecked());
});

test('declining the confirmation leaves the Supplier requirement unchanged', async () => {
  window.confirm.mockReturnValue(false);
  render(<SupplierDashboard />);
  const checkbox = await screen.findByRole('checkbox', { name: 'Require partnership for all Supplier offers' });
  fireEvent.click(checkbox);
  expect(supplierService.updateProfile).not.toHaveBeenCalled();
  expect(checkbox).not.toBeChecked();
});
