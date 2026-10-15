import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ReturnTracker, { ReturnCard, actionsForReturn, RETURN_STAGES } from './ReturnTracker';
import { returnService } from '../../services/returnService';

const customer = { _id: 'customer-1', role: 'customer' };
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'customer-1', role: 'customer' } }) }));
jest.mock('../../services/returnService', () => ({
  returnService: { forOrder: jest.fn(), request: jest.fn(), transition: jest.fn(), riders: jest.fn(), evidenceAccess: jest.fn() }
}));

const record = (status = 'requested', extra = {}) => ({
  _id: 'return-1', order: 'order-1', customer: 'customer-1', store: 'store-1',
  itemSnapshot: { name: 'Pet supply', quantity: 1 }, status,
  refund: { status: 'unlinked' },
  history: [{ action: 'request', toStatus: 'requested', at: '2026-10-15T00:00:00Z' }],
  ...extra
});

test('seven real progress stages and refund independence render accessibly', () => {
  render(<ReturnCard record={record('arrived', { sellerReceipt: { confirmedAt: '2026-10-15T09:00:00Z' } })}
    user={customer} onAction={jest.fn()} />);
  expect(screen.getByRole('list', { name: 'Return to Seller progress' }).children).toHaveLength(7);
  const progress = within(screen.getByRole('list', { name: 'Return to Seller progress' }));
  RETURN_STAGES.forEach(([, title]) => expect(progress.getByText(new RegExp(title))).toBeInTheDocument());
  expect(screen.getByText(/Seller receipt confirmed/i)).toBeInTheDocument();
  expect(screen.getByText(/Return completion does not confirm a refund/i)).toBeInTheDocument();
});

test('actions follow actor and stage, not merely a frontend-visible label', () => {
  const seller = { _id: 'seller-1', role: 'store_owner' };
  const rider = { _id: 'rider-1', role: 'delivery_rider' };
  expect(actionsForReturn(record(), customer)).toEqual(['cancel']);
  expect(actionsForReturn(record(), seller)).toEqual(['approve', 'reject', 'cancel']);
  expect(actionsForReturn(record(), { _id: 'seller-2', role: 'staff', staffType: 'manager' }))
    .toEqual(['approve', 'reject', 'cancel']);
  expect(actionsForReturn(record(), { _id: 'cashier-1', role: 'staff', staffType: 'order_staff' }))
    .toEqual([]);
  expect(actionsForReturn(record('ready_for_pickup', { assignedRider: 'rider-1' }), rider))
    .toEqual(['pickup', 'report_delayed', 'report_pickup_failed']);
  expect(actionsForReturn(record('arrived'), seller)).toEqual(['confirm_receipt']);
  expect(actionsForReturn(record('arrived', { sellerReceipt: { confirmedAt: new Date() } }), seller)).toEqual(['complete']);
  expect(actionsForReturn(record('completed'), seller)).toEqual([]);
});

test('failed status update keeps the seller note available for retry', async () => {
  const seller = { _id: 'seller-1', role: 'store_owner' };
  const onAction = jest.fn().mockResolvedValue(false);
  render(<ReturnCard record={record('requested')} user={seller} onAction={onAction} />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Next return action' }), { target: { value: 'reject' } });
  fireEvent.change(screen.getByRole('textbox', { name: /Reason or note/i }), { target: { value: 'Item is outside policy' } });
  fireEvent.click(screen.getByRole('button', { name: 'Reject return' }));
  await waitFor(() => expect(onAction).toHaveBeenCalled());
  expect(screen.getByRole('textbox', { name: /Reason or note/i })).toHaveValue('Item is outside policy');
});

test('private evidence is opened only through an authorized short-lived access request', async () => {
  returnService.evidenceAccess.mockResolvedValue({ data: { url: 'https://example.invalid/signed' } });
  render(<ReturnCard record={record('requested', { evidence: [{ _id: 'evidence-1', originalName: 'item.jpg' }] })}
    user={customer} onAction={jest.fn()} onEvidence={jest.fn()} />);
  expect(screen.queryByRole('link', { name: 'Open image' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Get secure link' }));
  await waitFor(() => expect(returnService.evidenceAccess).toHaveBeenCalledWith('return-1', 'evidence-1'));
  expect(await screen.findByRole('link', { name: 'Open image' })).toHaveAttribute('href', 'https://example.invalid/signed');
});

test('exception and terminal records do not masquerade as successful progress', () => {
  const view = render(<ReturnCard record={record('ready_for_pickup', { exception: { kind: 'pickup_failed', reason: 'No pickup' } })}
    user={customer} onAction={jest.fn()} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Pickup failed: No pickup');
  expect(screen.getByText(/Return Completed/).closest('li')).not.toHaveClass('bg-emerald-50');
  view.rerender(<ReturnCard record={record('rejected')} user={customer} onAction={jest.fn()} />);
  expect(screen.getByRole('status')).toHaveTextContent(/rejected/i);
});

test('customer can request an eligible item and refresh the real backend state', async () => {
  returnService.forOrder.mockResolvedValue({ data: {
    returns: [], eligibleItems: [{ _id: 'item-1', name: 'Pet supply', quantity: 1 }]
  } });
  returnService.request.mockResolvedValue({ data: { created: true } });
  render(<ReturnTracker order={{ _id: 'order-1' }} />);
  expect(await screen.findByRole('button', { name: 'Request return' })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Item to return' }), { target: { value: 'item-1' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Return reason' }), { target: { value: 'Needs review' } });
  fireEvent.click(screen.getByRole('button', { name: 'Request return' }));
  await waitFor(() => expect(returnService.request).toHaveBeenCalledWith('order-1', 'item-1', 'Needs review'));
  await waitFor(() => expect(returnService.forOrder).toHaveBeenCalledTimes(2));
});

test('loading and API failure show a retry control without inventing return records', async () => {
  returnService.forOrder.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: { returns: [], eligibleItems: [] } });
  render(<ReturnTracker order={{ _id: 'order-1' }} />);
  expect(screen.getByRole('status')).toHaveTextContent(/Loading returns/i);
  expect(await screen.findByRole('alert')).toHaveTextContent(/Could not load return tracking/i);
  expect(screen.queryByText(/No customer returns have been requested/i)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText(/No customer returns have been requested/i)).toBeInTheDocument();
});
