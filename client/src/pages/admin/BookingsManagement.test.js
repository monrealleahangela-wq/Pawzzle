import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BookingsManagement from './BookingsManagement';
import { adminBookingService, deliveryService } from '../../services/apiService';

jest.mock('../../services/apiService', () => ({
  adminBookingService: {
    getAllBookings: jest.fn(),
    getBookingById: jest.fn(),
    getEligibleStaff: jest.fn(),
    prepareProposal: jest.fn(),
    updateBookingStatus: jest.fn(),
    cancelBooking: jest.fn()
  },
  deliveryService: {
    getTrackingForBooking: jest.fn(),
    assignRider: jest.fn()
  },
  staffService: { getEligibleRiders: jest.fn() },
  getImageUrl: value => value
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn() }
}));

jest.mock('../../components/delivery/DeliveryAssignmentFields', () => () => null);
jest.mock('../../components/booking/ServiceCommunicationPanel', () => () => null);
jest.mock('../../components/payments/PaymentBreakdown', () => () => null);
jest.mock('../../components/booking/ServiceSpecificBookingFields', () => ({ ServiceIntakeSummary: () => null }));

const booking = {
  _id: 'booking-123456789012',
  customer: { firstName: 'Alice', lastName: 'Customer', email: 'alice@example.com', phone: '09171234567' },
  service: { _id: 'service-1', name: 'Pet Vaccination', duration: 60 },
  store: { _id: 'store-1', taxConfiguration: { isConfigured: true } },
  pet: { name: 'Milo', type: 'Dog', breed: 'Mixed', age: 2, weight: 8, size: 'Small' },
  bookingDate: '2030-10-14T00:00:00.000Z',
  startTime: '10:00',
  endTime: '11:00',
  status: 'pending',
  paymentStatus: 'pending',
  totalPrice: 500,
  proposal: {},
  selectedAddOns: [],
  selectedConditions: []
};

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.setItem('user', JSON.stringify({ _id: 'owner-1', role: 'store_owner' }));
  adminBookingService.getAllBookings.mockResolvedValue({ data: { bookings: [booking] } });
  adminBookingService.getEligibleStaff.mockResolvedValue({
    data: {
      staff: [{ _id: 'vet-1', firstName: 'Ana', lastName: 'Vet', staffType: 'veterinarian', averageRating: 0, reviewCount: 0 }],
      assignmentReadiness: { reason: 'eligible', message: 'Qualified staff are available for this service and schedule.', eligibleCount: 1 }
    }
  });
  deliveryService.getTrackingForBooking.mockResolvedValue({ data: { delivery: null } });
});

test('booking proposal flow keeps Back separate from Close and preserves entered values', async () => {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><BookingsManagement /></MemoryRouter>);

  const customer = await screen.findByText('Alice Customer');
  fireEvent.click(customer.closest('tr'));

  expect(await screen.findByRole('dialog', { name: /123456789012/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Continue to Staff Assignment' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Back to Details' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Continue to Staff Assignment' }));
  expect(await screen.findByRole('button', { name: 'Back to Details' })).toBeInTheDocument();

  const instructions = await screen.findByRole('textbox', { name: 'Customer-visible proposal instructions' });
  fireEvent.change(instructions, { target: { value: 'Bring vaccination records.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Back to Details' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue to Staff Assignment' }));

  expect(screen.getByRole('textbox', { name: 'Customer-visible proposal instructions' })).toHaveValue('Bring vaccination records.');
  await waitFor(() => expect(adminBookingService.getEligibleStaff).toHaveBeenCalledWith(booking._id));
});
