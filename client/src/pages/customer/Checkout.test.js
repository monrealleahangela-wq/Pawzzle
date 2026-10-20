import React from 'react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Checkout from './Checkout';
import { useCart } from '../../contexts/CartContext';
import { orderService, paymentService, voucherService } from '../../services/apiService';

const mockUser = {
  phone: '09990000000',
  address: { street: 'Test Street', city: 'Test City', barangay: 'Test Barangay', province: 'Cavite', coordinates: { lat: 14.32, lng: 120.92 } }
};
jest.mock('../../contexts/CartContext', () => ({ useCart: jest.fn() }));
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, user: mockUser })
}));
jest.mock('../../services/apiService', () => ({
  orderService: { quoteOrder: jest.fn(), createOrder: jest.fn() },
  paymentService: { cancelPayment: jest.fn(), createCheckoutSession: jest.fn(), createOrderBatchCheckoutSession: jest.fn() },
  storeService: { getStoreById: jest.fn(), getAllStores: jest.fn() },
  voucherService: { getMyVouchers: jest.fn(), verifyVoucher: jest.fn() },
  getImageUrl: value => value
}));
jest.mock('../../components/MapPicker', () => ({ onLocationSelected }) => (
  <button type="button" onClick={() => onLocationSelected({
    street: 'Second Street', city: 'Test City', barangay: 'Test Barangay',
    coordinates: { lat: 14.34, lng: 120.94 }
  })}>Select second location</button>
));
jest.mock('react-toastify', () => ({ toast: { error: jest.fn(), success: jest.fn(), info: jest.fn(), warn: jest.fn(), warning: jest.fn() } }));

const product = (itemId = 'product-1', quantity = 1) => ({
  itemType: 'product', itemId, quantity, selected: true, name: 'Synthetic Supply', price: 100,
  storeId: 'store-1', storeName: 'Synthetic Store'
});
const quote = (total = 145) => ({
  deliveryMethod: 'delivery', store: { _id: 'store-1', name: 'Synthetic Store' },
  items: [{ itemType: 'product', itemId: 'product-1', quantity: 1, name: 'Synthetic Supply', price: 100 }],
  pricingBreakdown: { calculationVersion: 1, subtotal: 100, deliveryFee: 45, finalTotal: total, taxStatus: 'non_vat' },
  deliveryFeeCalculation: { totalFee: 45, rule: { id: 'rule-1' }, distanceKm: 2, breakdown: { baseFee: 45 } }
});
const deferred = () => {
  let resolve;
  const promise = new Promise(complete => { resolve = complete; });
  return { promise, resolve };
};
const renderCheckout = () => render(
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Checkout />
  </MemoryRouter>
);
const payButton = () => screen.getByRole('button', { name: /pay now/i });

beforeEach(() => {
  jest.clearAllMocks();
  voucherService.getMyVouchers.mockResolvedValue({ data: { vouchers: [] } });
  useCart.mockReturnValue({ items: [product()], getSelectedItems: () => [product()], clearSelectedItems: jest.fn() });
});

test('backend coverage error blocks payment and Retry obtains a fresh authoritative quote', async () => {
  orderService.quoteOrder
    .mockRejectedValueOnce({ response: { data: { code: 'OUTSIDE_DELIVERY_RANGE', message: 'Internal distance details' } } })
    .mockResolvedValueOnce({ data: quote() });
  renderCheckout();
  fireEvent.click(screen.getByRole('button', { name: /use this address/i }));
  expect(await screen.findByText("This address is outside the Store's delivery coverage.")).toBeInTheDocument();
  expect(payButton()).toBeDisabled();
  expect(screen.queryByText('Internal distance details')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry delivery quote' }));
  await waitFor(() => expect(payButton()).toBeEnabled());
  expect(orderService.quoteOrder).toHaveBeenCalledTimes(2);
  expect(orderService.quoteOrder.mock.calls[1][0].shippingAddress.coordinates).toEqual({ lat: 14.32, lng: 120.92 });
});

test('changing the selected address invalidates an in-flight quote and rejects its stale response', async () => {
  const pending = deferred();
  orderService.quoteOrder.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ data: quote() });
  renderCheckout();
  fireEvent.click(screen.getByRole('button', { name: /use this address/i }));
  await waitFor(() => expect(orderService.quoteOrder).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: /change address/i }));
  expect(payButton()).toBeDisabled();
  await act(async () => { pending.resolve({ data: quote() }); });
  fireEvent.click(screen.getByRole('button', { name: /select second location/i }));
  await waitFor(() => expect(orderService.quoteOrder).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(payButton()).toBeEnabled());
  expect(orderService.quoteOrder.mock.calls[1][0].shippingAddress.coordinates).toEqual({ lat: 14.34, lng: 120.94 });
});

test('cart change invalidates a prior quote before the replacement request resolves', async () => {
  const pending = deferred();
  orderService.quoteOrder.mockResolvedValueOnce({ data: quote() }).mockReturnValueOnce(pending.promise);
  const view = renderCheckout();
  fireEvent.click(screen.getByRole('button', { name: /use this address/i }));
  await waitFor(() => expect(payButton()).toBeEnabled());
  const changedItems = [product('product-1', 2)];
  useCart.mockReturnValue({ items: changedItems, getSelectedItems: () => changedItems, clearSelectedItems: jest.fn() });
  view.rerender(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Checkout /></MemoryRouter>);
  expect(payButton()).toBeDisabled();
  await waitFor(() => expect(orderService.quoteOrder).toHaveBeenCalledTimes(2));
  expect(orderService.quoteOrder.mock.calls[1][0].items[0].quantity).toBe(2);
  await act(async () => { pending.resolve({ data: quote() }); });
});

test('an incomplete or manipulated quote never enables payment', async () => {
  orderService.quoteOrder.mockResolvedValue({ data: { ...quote(), deliveryFeeCalculation: null } });
  renderCheckout();
  fireEvent.click(screen.getByRole('button', { name: /use this address/i }));
  expect(await screen.findByText("We couldn't calculate delivery right now. Please retry in a moment.")).toBeInTheDocument();
  expect(payButton()).toBeDisabled();
  expect(orderService.createOrder).not.toHaveBeenCalled();
});

test('products from different Stores create one combined PayMongo checkout', async () => {
  const secondProduct = { ...product('product-2'), name: 'Other Supply', storeId: 'store-2', storeName: 'Other Store' };
  const selectedItems = [product(), secondProduct];
  const clearSelectedItems = jest.fn();
  useCart.mockReturnValue({ items: selectedItems, getSelectedItems: () => selectedItems, clearSelectedItems });
  const firstOrderQuote = quote(145);
  const secondOrderQuote = {
    ...quote(125),
    store: { _id: 'store-2', name: 'Other Store' },
    items: [{ itemType: 'product', itemId: 'product-2', quantity: 1, name: 'Other Supply', price: 80 }]
  };
  orderService.quoteOrder.mockResolvedValue({ data: {
    deliveryMethod: 'delivery', storeCount: 2,
    items: [...firstOrderQuote.items, ...secondOrderQuote.items],
    orders: [firstOrderQuote, secondOrderQuote],
    refundPolicies: [],
    pricingBreakdown: { calculationVersion: 1, subtotal: 180, deliveryFee: 90, finalTotal: 270, taxStatus: 'mixed' }
  } });
  orderService.createOrder.mockResolvedValue({ data: {
    order: { _id: 'order-1', totalAmount: 145 },
    orders: [{ _id: 'order-1', totalAmount: 145 }, { _id: 'order-2', totalAmount: 125 }],
    checkoutBatch: { _id: 'batch-1', totalAmount: 270 }
  } });
  paymentService.createOrderBatchCheckoutSession.mockResolvedValue({ data: {} });

  renderCheckout();
  fireEvent.click(screen.getByRole('button', { name: /use this address/i }));
  await waitFor(() => expect(payButton()).toBeEnabled());
  expect(screen.getByText('One payment, 2 Store orders')).toBeInTheDocument();
  fireEvent.click(payButton());

  await waitFor(() => expect(orderService.createOrder).toHaveBeenCalledTimes(1));
  expect(orderService.createOrder.mock.calls[0][0].items).toHaveLength(2);
  expect(orderService.createOrder.mock.calls[0][0].checkoutRequestId).toBeTruthy();
  await waitFor(() => expect(paymentService.createOrderBatchCheckoutSession).toHaveBeenCalledWith('batch-1'));
  expect(paymentService.createCheckoutSession).not.toHaveBeenCalled();
  expect(clearSelectedItems).not.toHaveBeenCalled();
});

test('a failed combined payment session preserves every cart item', async () => {
  const secondProduct = { ...product('product-2'), storeId: 'store-2', storeName: 'Other Store' };
  const selectedItems = [product(), secondProduct];
  const clearSelectedItems = jest.fn();
  useCart.mockReturnValue({ items: selectedItems, getSelectedItems: () => selectedItems, clearSelectedItems });
  orderService.quoteOrder.mockResolvedValue({ data: {
    deliveryMethod: 'delivery', storeCount: 2,
    items: [quote().items[0], { ...quote().items[0], itemId: 'product-2' }],
    orders: [quote(145), { ...quote(145), store: { _id: 'store-2', name: 'Other Store' } }],
    refundPolicies: [],
    pricingBreakdown: { calculationVersion: 1, subtotal: 200, deliveryFee: 90, finalTotal: 290, taxStatus: 'mixed' }
  } });
  orderService.createOrder.mockResolvedValue({ data: {
    order: { _id: 'order-1', totalAmount: 145 },
    orders: [{ _id: 'order-1', totalAmount: 145 }, { _id: 'order-2', totalAmount: 145 }],
    checkoutBatch: { _id: 'batch-1', totalAmount: 290 }
  } });
  paymentService.createOrderBatchCheckoutSession.mockRejectedValue(new Error('PayMongo unavailable'));

  renderCheckout();
  fireEvent.click(screen.getByRole('button', { name: /use this address/i }));
  await waitFor(() => expect(payButton()).toBeEnabled());
  fireEvent.click(payButton());

  await waitFor(() => expect(paymentService.createOrderBatchCheckoutSession).toHaveBeenCalledWith('batch-1'));
  expect(clearSelectedItems).not.toHaveBeenCalled();
});
