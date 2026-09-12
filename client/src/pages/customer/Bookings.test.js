import React from 'react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import Bookings from './Bookings';
import { bookingService } from '../../services/apiService';

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'customer-1', role: 'customer' } })
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
  getImageUrl: value => value
}));

const renderBookings = () => render(
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
});
