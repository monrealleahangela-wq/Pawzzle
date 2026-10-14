import React from 'react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Bookings from './Bookings';
import { bookingService, paymentService, petCareService } from '../../services/apiService';

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'customer-1', role: 'customer' } })
}));

jest.mock('react-toastify', () => ({
  toast: {
    success: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
    info: jest.fn()
  }
}));

jest.mock('../../utils/socket', () => ({
  __esModule: true,
  default: {
    connected: true,
    connect: jest.fn(),
    on: jest.fn(),
    off: jest.fn()
  }
}));

jest.mock('../../services/apiService', () => ({
  bookingService: {
    getCustomerBookings: jest.fn(),
    getEligibleStaff: jest.fn(),
    getBookingById: jest.fn(),
    getAllBookings: jest.fn()
  },
  serviceService: { getServiceById: jest.fn() },
  voucherService: { getMyVouchers: jest.fn(), verifyVoucher: jest.fn() },
  petProfileService: { getMyPets: jest.fn() },
  paymentService: { verifyBookingPayment: jest.fn(), cancelPayment: jest.fn() },
  petCareService: {
    getServiceTimeline: jest.fn(),
    sendServiceMessage: jest.fn()
  },
  adminBookingService: {
    checkIn: jest.fn(),
    updateBookingStatus: jest.fn(),
    getBookingById: jest.fn()
  },
  getImageUrl: value => value
}));

const renderBookings = (initialEntries = ['/bookings']) => render(
  <MemoryRouter initialEntries={initialEntries} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Bookings />
  </MemoryRouter>
);

describe('customer booking history', () => {
  afterEach(() => jest.clearAllMocks());

  test('shows a friendly empty state for a customer with no bookings', async () => {
    bookingService.getCustomerBookings.mockResolvedValue({ data: { bookings: [], pagination: { totalBookings: 0 } } });
    renderBookings();
    expect(await screen.findByRole('heading', { name: 'No Appointments' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse Services' })).toHaveAttribute('href', '/services');
  });

  test('renders active, completed, cancelled, and legacy records without optional references', async () => {
    bookingService.getCustomerBookings.mockResolvedValue({ data: { bookings: [
      { _id: 'booking-pending', bookingDate: '2026-10-15', startTime: '09:00', status: 'pending', paymentStatus: 'pending', totalPrice: 500, pet: { name: 'Mochi', type: 'Dog' }, service: { name: 'Grooming' }, store: { name: 'Pawzzle' } },
      { _id: 'booking-completed', bookingDate: '2026-09-01', startTime: '13:30', status: 'completed', paymentStatus: 'paid', totalPrice: 800, pet: { name: 'Luna', type: 'Cat' }, service: { name: 'Wellness Visit' }, store: { name: 'Pawzzle' } },
      { _id: 'booking-cancelled', bookingDate: '2026-08-01', startTime: '08:00', status: 'cancelled', paymentStatus: 'refunded', totalPrice: 300, pet: { name: 'Milo', type: 'Dog' }, service: { name: 'Training' }, store: { name: 'Pawzzle' } },
      { _id: 'booking-legacy', bookingDate: null, startTime: { old: true }, status: 'old_status', service: null, store: null, pet: null, payment: null }
    ] } });

    renderBookings();

    expect(await screen.findByText('Grooming')).toBeInTheDocument();
    expect(screen.getByText('Wellness Visit')).toBeInTheDocument();
    expect(screen.getByText('Training')).toBeInTheDocument();
    expect(screen.getByText('Service unavailable')).toBeInTheDocument();
    expect(screen.getByText('Date unavailable')).toBeInTheDocument();
    expect(screen.getByText('Time unavailable')).toBeInTheDocument();
    expect(screen.getAllByText('Pending assignment')).toHaveLength(4);
    expect(screen.getByText('Payment information unavailable')).toBeInTheDocument();
    expect(screen.getByText('old status')).toBeInTheDocument();
  });

  test('opens a viewport-safe booking dialog after payment success without nested timeline scrolling', async () => {
    const bookingId = '6acf3458e5738d70d55c3804';
    const paidBooking = {
      _id: bookingId,
      bookingDate: '2026-10-20',
      startTime: '10:00',
      endTime: '11:00',
      status: 'approved',
      paymentStatus: 'paid',
      paymentMethod: 'paymongo',
      totalPrice: 950,
      notes: 'Please keep the customer updated.',
      pet: { _id: 'pet-1', name: 'Mochi', type: 'Dog' },
      service: { _id: 'service-1', name: 'General Checkup', category: 'Veterinary' },
      store: { _id: 'store-1', name: 'Pawzzle Care', contactInfo: {} },
      pricingBreakdown: {
        calculationVersion: 'v1',
        basePrice: 950,
        subtotal: 950,
        total: 950
      }
    };
    const bookingsResponse = { data: { bookings: [paidBooking], pagination: { totalBookings: 1 } } };
    const timelineResponse = {
      data: {
        timeline: [
          { _id: 'payment', entryType: 'update', stage: 'payment_completed', createdAt: '2026-10-20T01:00:00Z' },
          { _id: 'confirmed', entryType: 'update', stage: 'booking_confirmed', createdAt: '2026-10-20T01:05:00Z' },
          { _id: 'photo', entryType: 'photo', stage: 'completed', media: [{ url: '/after.jpg', category: 'after' }], createdAt: '2026-10-20T03:00:00Z' },
          { _id: 'message', entryType: 'message', message: 'Mochi is resting comfortably.', sender: { firstName: 'Care', lastName: 'Team' }, createdAt: '2026-10-20T03:05:00Z' }
        ],
        summary: null,
        permissions: { canMessage: true }
      }
    };

    bookingService.getCustomerBookings.mockResolvedValue(bookingsResponse);
    paymentService.verifyBookingPayment.mockResolvedValue({ data: { status: 'paid' } });
    petCareService.getServiceTimeline.mockResolvedValue(timelineResponse);
    petCareService.sendServiceMessage.mockResolvedValue({ data: { notificationDelivered: true } });

    renderBookings([`/bookings?payment=success&id=${bookingId}`]);

    const dialog = await screen.findByRole('dialog', { name: /Booking #/i });
    expect(paymentService.verifyBookingPayment).toHaveBeenCalledWith(bookingId);
    expect(dialog).toHaveClass('min-h-0', 'max-h-[calc(100dvh-1rem)]', 'flex-col', 'overflow-hidden');
    expect(dialog.parentElement).toHaveAttribute('data-modal-viewport', 'true');

    const header = screen.getByTestId('customer-booking-modal-header');
    const content = screen.getByTestId('customer-booking-modal-content');
    const footer = screen.getByTestId('customer-booking-modal-footer');
    expect(header).toHaveClass('shrink-0');
    expect(content).toHaveClass('min-h-0', 'overflow-y-auto', 'overscroll-contain');
    expect(footer).toHaveClass('shrink-0');

    const closeButton = screen.getByRole('button', { name: 'Close booking details' });
    expect(closeButton).toBeVisible();
    await waitFor(() => expect(closeButton).toHaveFocus());

    expect(await screen.findByText('Payment completed')).toBeInTheDocument();
    expect(screen.getByText('Booking confirmed')).toBeInTheDocument();
    expect(screen.getByText('After photo')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Completed update' })).toHaveAttribute('src', '/after.jpg');
    expect(screen.getByText('Mochi is resting comfortably.')).toBeInTheDocument();

    const timeline = screen.getByTestId('service-timeline');
    expect(timeline).not.toHaveClass('overflow-y-auto');
    expect(timeline).not.toHaveClass('max-h-80');

    fireEvent.change(screen.getByPlaceholderText('Message the service team'), { target: { value: 'Thank you for the update.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send service message' }));
    await waitFor(() => expect(petCareService.sendServiceMessage).toHaveBeenCalledWith(bookingId, 'Thank you for the update.'));
    expect(screen.getByRole('dialog', { name: /Booking #/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close booking details' }));
    expect(screen.queryByRole('dialog', { name: /Booking #/i })).not.toBeInTheDocument();
    expect(paymentService.cancelPayment).not.toHaveBeenCalled();
  });
});
