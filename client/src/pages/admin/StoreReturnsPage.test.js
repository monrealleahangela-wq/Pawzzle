import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StoreReturnsPage from './StoreReturnsPage';
import { returnService } from '../../services/returnService';

jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'manager-1', role: 'staff', staffType: 'manager' } }) }));
jest.mock('../../services/returnService', () => ({ returnService: { store: jest.fn(), transition: jest.fn(), uploadEvidence: jest.fn() } }));
jest.mock('../../components/returns/ReturnTracker', () => ({ ReturnCard: ({ record, riders }) =>
  <div>Return {record.itemSnapshot.name}; available Riders {riders.length}</div> }));

test('Store return queue renders authorized backend records and same-Store Rider choices', async () => {
  returnService.store.mockResolvedValue({ data: { returns: [{ _id: 'return-1', order: 'order-1', store: 'store-1',
    itemSnapshot: { name: 'Pet supply' } }], riders: [
    { _id: 'rider-1', store: 'store-1' }, { _id: 'rider-2', store: 'store-2' }
  ] } });
  render(<MemoryRouter><StoreReturnsPage /></MemoryRouter>);
  expect(await screen.findByText('Return Pet supply; available Riders 1')).toBeInTheDocument();
  expect(returnService.store).toHaveBeenCalledTimes(1);
});

test('Store queue failure gives a retry affordance without fake return records', async () => {
  returnService.store.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: { returns: [], riders: [] } });
  render(<MemoryRouter><StoreReturnsPage /></MemoryRouter>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load Store returns.');
  expect(screen.queryByText('No customer returns for your Store.')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(returnService.store).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('No customer returns for your Store.')).toBeInTheDocument();
});
