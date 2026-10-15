import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotificationBell from './NotificationBell';
import { notificationDestination } from '../utils/notificationNavigation';

const mockMarkAsRead = jest.fn();
const mockMarkAllRead = jest.fn();
const mockDeleteNotification = jest.fn();
const mockFetch = jest.fn();
let mockState;

jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'customer-1', role: 'customer' } }) }));
jest.mock('../contexts/NotificationContext', () => ({ useNotifications: () => mockState }));

const renderBell = () => render(<MemoryRouter><NotificationBell /></MemoryRouter>);

beforeEach(() => {
  jest.clearAllMocks();
  mockState = { notifications: [{ _id: 'notification-1', title: 'Order ready', message: 'Your order is ready.',
    targetUrl: '/orders/507f1f77bcf86cd799439011', relatedModel: 'Order', relatedId: '507f1f77bcf86cd799439011', createdAt: new Date().toISOString(), isRead: false }],
    unreadCount: 1, loading: false, error: null, fetchNotifications: mockFetch,
    markAsRead: mockMarkAsRead, markAllRead: mockMarkAllRead, deleteNotification: mockDeleteNotification };
});

test('shows unread count, real content, read actions and history link', () => {
  renderBell();
  fireEvent.click(screen.getByRole('button', { name: 'Open notifications, 1 unread' }));
  expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeInTheDocument();
  expect(screen.getByText('Your order is ready.')).toBeInTheDocument();
  expect(screen.getByText('Related: Order · 439011')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Mark Order ready as read' }));
  expect(mockMarkAsRead).toHaveBeenCalledWith('notification-1');
  fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
  expect(mockMarkAllRead).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Delete notification: Order ready' }));
  expect(mockDeleteNotification).toHaveBeenCalledWith('notification-1');
  expect(screen.getByRole('link', { name: 'View All Notifications' })).toHaveAttribute('href', '/notifications');
});

test('supports keyboard close and focus return', () => {
  renderBell();
  const trigger = screen.getByRole('button', { name: 'Open notifications, 1 unread' });
  fireEvent.click(trigger);
  expect(screen.getByRole('button', { name: 'Close notification panel' })).toHaveFocus();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

test('shows loading, empty and error/retry states in mobile-size panel', () => {
  mockState = { ...mockState, notifications: [], unreadCount: 0, loading: true };
  const view = renderBell();
  fireEvent.click(screen.getByRole('button', { name: 'Open notifications' }));
  expect(screen.getByRole('status')).toHaveTextContent('Loading notifications');
  expect(screen.getByRole('dialog')).toHaveClass('fixed');
  view.unmount();
  mockState = { ...mockState, loading: false, error: 'Notifications could not be loaded. Please retry.' };
  renderBell();
  fireEvent.click(screen.getByRole('button', { name: 'Open notifications' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Notifications could not be loaded');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(mockFetch).toHaveBeenCalled();
});

test('does not offer unsafe external notification links', () => {
  mockState.notifications[0].targetUrl = 'https://example.invalid/steal';
  mockState.notifications[0].relatedId = 'not-an-id';
  renderBell();
  fireEvent.click(screen.getByRole('button', { name: 'Open notifications, 1 unread' }));
  expect(screen.queryByRole('button', { name: 'View details' })).not.toBeInTheDocument();
});

test('preserves legacy notification destinations without crossing role boundaries', () => {
  const customer = { role: 'customer' };
  const admin = { role: 'super_admin' };
  const id = '507f1f77bcf86cd799439011';
  expect(notificationDestination({ type: 'store_application' }, customer)).toBe('/account-upgrade');
  expect(notificationDestination({ type: 'store_application' }, admin)).toBe('/superadmin/store-applications');
  expect(notificationDestination({ type: 'chat_message', relatedId: id }, customer)).toBe(`/messages/${id}`);
  expect(notificationDestination({ type: 'new_follow' }, customer)).toBe('/profile?tab=followers');
  expect(notificationDestination({ relatedModel: 'Report', relatedId: id }, customer)).toBeNull();
  expect(notificationDestination({ relatedModel: 'Report', relatedId: id }, admin)).toBe('/superadmin/reports');
  expect(notificationDestination({ targetUrl: '/superadmin/reports' }, customer)).toBeNull();
});
