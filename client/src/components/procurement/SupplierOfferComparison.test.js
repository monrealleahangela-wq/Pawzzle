import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SupplierOfferComparison from './SupplierOfferComparison';
import { purchaseOrderService } from '../../services/apiService';

jest.mock('../../services/apiService', () => ({ purchaseOrderService: {
  compareOffers: jest.fn(), confirmOfferMatch: jest.fn(), addCartItem: jest.fn(),
  getProcurementStoreProducts: jest.fn()
} }));

const candidate = { supplierProductId: 'offer-2', supplier: { businessName: 'Supplier B' }, name: 'Food B',
  sku: 'B', unitOfMeasure: 'bag', unitPrice: 265, availableStock: 3, minimumOrderQuantity: 1,
  deliveryLeadTimeDays: 2, available: true, matchType: 'unverified_candidate' };
const response = offer => ({ data: { storeProduct: { name: 'Store Food' }, offers: [offer] } });
const props = { storeProducts: [{ _id: 'product-1', name: 'Store Food', sku: 'STORE-FOOD' }],
  initialStoreProductId: 'product-1', onCartUpdated: jest.fn(), onClose: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  purchaseOrderService.confirmOfferMatch.mockResolvedValue({ data: { matchType: 'equivalent' } });
  purchaseOrderService.addCartItem.mockResolvedValue({ data: { items: [{ supplierProductId: 'offer-2' }] } });
  purchaseOrderService.getProcurementStoreProducts.mockResolvedValue({ data: { products: props.storeProducts, pagination: { page: 1, totalPages: 1 } } });
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => { window.confirm.mockRestore(); });

test('requires explicit reviewed match and seller selection before adding an alternative', async () => {
  purchaseOrderService.compareOffers
    .mockResolvedValueOnce(response(candidate))
    .mockResolvedValueOnce(response({ ...candidate, matchType: 'equivalent' }));
  render(<SupplierOfferComparison {...props} />);
  expect(await screen.findByText('Unverified candidate')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add this supplier' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Review match' }));
  await waitFor(() => expect(purchaseOrderService.confirmOfferMatch).toHaveBeenCalledWith({
    storeProductId: 'product-1', targetType: 'product', supplierProductId: 'offer-2', matchType: 'equivalent', confirmMatch: true
  }));
  expect(await screen.findByText('equivalent match')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Quantity from Supplier B' }), { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add this supplier' }));
  await waitFor(() => expect(purchaseOrderService.addCartItem).toHaveBeenCalledWith('offer-2', 2, {
    storeProductId: 'product-1', confirmSelection: true
  }));
  await waitFor(() => expect(props.onCartUpdated).toHaveBeenCalled());
});

test('selects a reviewed service-supply offer without changing an existing Store product', async () => {
  const supply = { _id: 'supply-1', name: 'Shampoo', sku: 'SHAMPOO' };
  purchaseOrderService.getProcurementStoreProducts.mockImplementation(async params => ({
    data: { products: params.targetType === 'service_supply' ? [supply] : props.storeProducts,
      pagination: { page: 1, totalPages: 1 } }
  }));
  purchaseOrderService.compareOffers.mockResolvedValue(response({ ...candidate,
    name: 'Supplier shampoo', unitOfMeasure: 'bottle', matchType: 'exact' }));
  render(<SupplierOfferComparison {...props} />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Inventory destination' }),
    { target: { value: 'service_supply' } });
  await screen.findByRole('option', { name: 'Shampoo (SHAMPOO)' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Service supply' }),
    { target: { value: 'supply-1' } });
  expect(await screen.findByText('exact match')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add this supplier' }));
  await waitFor(() => expect(purchaseOrderService.addCartItem).toHaveBeenCalledWith('offer-2', 1, {
    serviceSupplyId: 'supply-1', confirmSelection: true
  }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add this supplier' })).not.toBeDisabled());
});

test('shows unavailable stock and safe retry without placing an order', async () => {
  purchaseOrderService.compareOffers.mockRejectedValueOnce(new Error('network'))
    .mockResolvedValueOnce(response({ ...candidate, matchType: 'exact', availableStock: 0, available: false }));
  render(<SupplierOfferComparison {...props} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load supplier offers');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText(/cannot fulfill its minimum quantity/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add this supplier' })).toBeDisabled();
  expect(purchaseOrderService.addCartItem).not.toHaveBeenCalled();
});
