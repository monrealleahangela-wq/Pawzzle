import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Notifications from './Notifications';
import notificationService from '../services/notificationService';

const mockMarkAsRead = jest.fn();
const mockMarkAllRead = jest.fn();
const mockDeleteNotification = jest.fn();
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'customer-1', role: 'customer' } }) }));
jest.mock('../contexts/NotificationContext', () => ({ useNotifications: () => ({ revision: 0, markAsRead: mockMarkAsRead, markAllRead: mockMarkAllRead, deleteNotification: mockDeleteNotification }) }));
jest.mock('../services/notificationService', () => ({ getNotifications: jest.fn() }));

const renderPage = () => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Notifications /></MemoryRouter>);

beforeEach(() => jest.clearAllMocks());

test('loads only API records and pages through history', async () => {
  notificationService.getNotifications.mockResolvedValueOnce({ data: { notifications: [{ _id: 'n1', title: 'Booking update', message: 'Confirmed', isRead: false,
    relatedModel: 'Booking', createdAt: new Date().toISOString() }], pagination: { totalPages: 2 } } })
    .mockResolvedValueOnce({ data: { notifications: [], pagination: { totalPages: 2 } } });
  renderPage();
  expect(screen.getByRole('status')).toHaveTextContent('Loading notifications');
  expect(await screen.findByText('Confirmed')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Mark Booking update as read' }));
  expect(mockMarkAsRead).toHaveBeenCalledWith('n1');
  fireEvent.click(screen.getByRole('button', { name: 'Delete notification: Booking update' }));
  expect(mockDeleteNotification).toHaveBeenCalledWith('n1');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => expect(notificationService.getNotifications).toHaveBeenCalledWith({ page: 2, limit: 20 }));
  expect(await screen.findByText('No notifications to show.')).toBeInTheDocument();
});

test('shows failed request and recovers on retry', async () => {
  notificationService.getNotifications.mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ data: { notifications: [], pagination: { totalPages: 1 } } });
  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load notifications');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('No notifications to show.')).toBeInTheDocument();
});
