import React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NotificationProvider, useNotifications } from './NotificationContext';
import notificationService from '../services/notificationService';
import socket from '../utils/socket';

let mockUser = { _id: 'user-1', role: 'customer' };
jest.mock('./AuthContext', () => ({ useAuth: () => ({ user: mockUser, token: 'synthetic-token' }) }));
jest.mock('../services/notificationService', () => ({
  getNotifications: jest.fn(), markAsRead: jest.fn(), markAllAsRead: jest.fn(), deleteNotification: jest.fn()
}));
jest.mock('../utils/socket', () => ({ __esModule: true, default: {
  connected: false, connect: jest.fn(), disconnect: jest.fn(), on: jest.fn(), off: jest.fn()
} }));

const Harness = () => {
  const state = useNotifications();
  return <><span data-testid="count">{state.unreadCount}</span><span data-testid="items">{state.notifications.length}</span>
    <button onClick={() => state.markAsRead('n1')}>Read</button><button onClick={state.markAllRead}>Read all</button></>;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { _id: 'user-1', role: 'customer' };
  notificationService.getNotifications.mockResolvedValue({ data: { notifications: [{ _id: 'n1', recipient: 'user-1', isRead: false }], unreadCount: 12 } });
  notificationService.markAsRead.mockResolvedValue({});
  notificationService.markAllAsRead.mockResolvedValue({});
});

test('uses server unread total, updates after read, and ignores another user socket event', async () => {
  const view = render(<NotificationProvider><Harness /></NotificationProvider>);
  await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('12'));
  expect(socket.on).toHaveBeenCalledTimes(1);
  const handler = socket.on.mock.calls[0][1];
  act(() => handler({ recipient: 'other-user' }));
  expect(notificationService.getNotifications).toHaveBeenCalledTimes(1);
  notificationService.getNotifications.mockResolvedValue({ data: { notifications: [], unreadCount: 11 } });
  fireEvent.click(screen.getByRole('button', { name: 'Read' }));
  await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('11'));
  act(() => handler({ recipient: 'user-1' }));
  await waitFor(() => expect(notificationService.getNotifications).toHaveBeenCalledTimes(3));
  view.unmount();
  expect(socket.off).toHaveBeenCalledWith('newNotification', handler);
  expect(socket.disconnect).toHaveBeenCalled();
});

test('read-all refetches the authoritative total', async () => {
  render(<NotificationProvider><Harness /></NotificationProvider>);
  await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('12'));
  notificationService.getNotifications.mockResolvedValue({ data: { notifications: [], unreadCount: 0 } });
  fireEvent.click(screen.getByRole('button', { name: 'Read all' }));
  await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('0'));
});

test('account change removes the old listener and ignores a late response', async () => {
  let resolveOld;
  notificationService.getNotifications.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
    .mockResolvedValue({ data: { notifications: [], unreadCount: 2 } });
  const view = render(<NotificationProvider><Harness /></NotificationProvider>);
  const oldHandler = socket.on.mock.calls[0][1];
  mockUser = { _id: 'user-2', role: 'staff' };
  view.rerender(<NotificationProvider><Harness /></NotificationProvider>);
  await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'));
  expect(socket.off).toHaveBeenCalledWith('newNotification', oldHandler);
  await act(async () => resolveOld({ data: { notifications: [{ _id: 'old' }], unreadCount: 99 } }));
  expect(screen.getByTestId('count')).toHaveTextContent('2');
  expect(screen.getByTestId('items')).toHaveTextContent('0');
});
