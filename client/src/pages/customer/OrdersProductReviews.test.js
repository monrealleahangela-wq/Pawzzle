import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Orders from './Orders';
import { orderReturnService, orderService } from '../../services/apiService';

jest.mock('../../services/apiService', () => ({
  orderService: { getAllOrders: jest.fn() },
  orderReturnService: { listForOrder: jest.fn() },
  deliveryService: {},
  getImageUrl: value => value
}));
jest.mock('../../hooks/useRealTimeUpdates', () => ({ useRealTimeUpdates: jest.fn() }));
jest.mock('./Adoptions', () => () => null);
jest.mock('./Bookings', () => () => null);
jest.mock('../../components/payments/PaymentBreakdown', () => () => null);
jest.mock('../../components/ReviewModal', () => () => null);
jest.mock('../../components/OrderReviewModal', () => ({ item, orderId, onClose }) => (
  <div role="dialog" aria-label="Selected product review">
    <span>{`${orderId}:${item._id}:${item.name}`}</span>
    <button onClick={onClose}>Close selected review</button>
  </div>
));

const order = {
  _id: 'order-1', orderNumber: 'ORD00000001', status: 'delivered', totalAmount: 200,
  orderDate: new Date('2026-10-16T00:00:00Z').toISOString(), paymentStatus: 'paid', deliveryMethod: 'delivery',
  items: [
    { _id: 'item-1', itemId: 'product-1', itemType: 'product', name: 'Dog Food', price: 100, quantity: 1, reviewStatus: { isRated: false } },
    { _id: 'item-2', itemId: 'product-2', itemType: 'product', name: 'Cat Toy', price: 100, quantity: 1, reviewStatus: { isRated: true } }
  ]
};

beforeEach(() => {
  jest.clearAllMocks();
  orderReturnService.listForOrder.mockResolvedValue({ data: { returns: [] } });
  orderService.getAllOrders.mockResolvedValue({
    data: { orders: [order], pagination: { currentPage: 1, totalPages: 1, hasNext: false, hasPrev: false } }
  });
});

test('renders a separate action/status for every purchased product and opens exact item context', async () => {
  render(<MemoryRouter><Orders /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Dog Food')).toBeInTheDocument());
  expect(screen.getByText('Already Reviewed')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /report an issue/i })).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: /review product/i }));
  expect(screen.getByRole('dialog', { name: 'Selected product review' })).toHaveTextContent('order-1:item-1:Dog Food');
  expect(screen.queryByText(/review.*shop/i)).not.toBeInTheDocument();
});

test('a paid completed pickup shows picked up and hides issue reporting', async () => {
  orderService.getAllOrders.mockResolvedValue({
    data: {
      orders: [{ ...order, status: 'completed', deliveryMethod: 'pickup' }],
      pagination: { currentPage: 1, totalPages: 1, hasNext: false, hasPrev: false }
    }
  });

  render(<MemoryRouter><Orders /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Dog Food')).toBeInTheDocument());
  expect(screen.getAllByText('Picked up').length).toBeGreaterThan(0);
  expect(screen.queryByText('Waiting for payment')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /report an issue/i })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /review product/i })).toBeInTheDocument();
});

test('paid orders cannot fall back to waiting for payment when a legacy status is stale', async () => {
  orderService.getAllOrders.mockResolvedValue({
    data: {
      orders: [{ ...order, status: 'pending', deliveryMethod: 'pickup' }],
      pagination: { currentPage: 1, totalPages: 1, hasNext: false, hasPrev: false }
    }
  });

  render(<MemoryRouter><Orders /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Dog Food')).toBeInTheDocument());
  expect(screen.getAllByText('Payment Received').length).toBeGreaterThan(0);
  expect(screen.queryByText('Waiting for payment')).not.toBeInTheDocument();
});

test('a failed order refresh keeps the page usable and exposes retry', async () => {
  orderService.getAllOrders.mockRejectedValueOnce(new Error('network'));
  render(<MemoryRouter><Orders /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('could not refresh'));
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(screen.getByText('Dog Food')).toBeInTheDocument());
});
