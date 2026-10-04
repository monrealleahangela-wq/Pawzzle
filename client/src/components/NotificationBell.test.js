import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import NotificationBell from './NotificationBell';

const mockNavigate = jest.fn();
const mockMarkAsRead = jest.fn();
const mockMarkAllRead = jest.fn();
const mockDeleteNotification = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate
}));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'customer' } })
}));

jest.mock('../contexts/NotificationContext', () => ({
  useNotifications: () => ({
    notifications: [{
      _id: 'notification-1',
      title: 'Order ready',
      message: 'Your order is ready for pickup.',
      relatedModel: 'Order',
      relatedId: 'order-1',
      createdAt: new Date().toISOString(),
      isRead: false
    }],
    unreadCount: 1,
    markAsRead: mockMarkAsRead,
    markAllRead: mockMarkAllRead,
    deleteNotification: mockDeleteNotification
  })
}));

describe('NotificationBell', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('exposes readable notification actions without hover-only controls', () => {
    render(<NotificationBell />);

    const trigger = screen.getByRole('button', { name: 'Open notifications, 1 unread' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);

    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByText('Your order is ready for pickup.')).toHaveClass('notification-copy');
    expect(screen.getByRole('button', { name: 'Delete notification: Order ready' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Delete notification: Order ready' }));
    expect(mockDeleteNotification).toHaveBeenCalledWith('notification-1');
  });
});
