import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BookingsManagement from './BookingsManagement';
import { adminBookingService, deliveryService, staffService } from '../../services/apiService';

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
  service: { _id: 'service-1', name: 'General Checkup and Veterinary Consultation', duration: 60 },
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
      staff: [
        { _id: 'vet-1', firstName: 'Ana', lastName: 'Vet', staffType: 'veterinarian', averageRating: 0, reviewCount: 0 },
        { _id: 'vet-2', firstName: 'Bea', lastName: 'Vet', staffType: 'veterinarian', averageRating: 5, reviewCount: 2 }
      ],
      assignmentReadiness: { reason: 'eligible', message: 'Qualified staff are available for this service and schedule.', eligibleCount: 1 }
    }
  });
  deliveryService.getTrackingForBooking.mockResolvedValue({ data: { delivery: null } });
  staffService.getEligibleRiders.mockResolvedValue({ data: { riders: [], assignmentReadiness: null } });
});

const openBookingModal = async () => {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><BookingsManagement /></MemoryRouter>);
  const customer = await screen.findByText('Alice Customer');
  fireEvent.click(customer.closest('tr'));
  const dialog = await screen.findByRole('dialog', { name: /123456789012/i });
  await waitFor(() => expect(dialog).toHaveAttribute('aria-busy', 'false'));
  return dialog;
};

test('booking modal uses a viewport-safe fixed shell with persistent header, scroll region, and footer', async () => {
  const modal = await openBookingModal();

  expect(modal).toHaveClass('min-h-0', 'max-h-[calc(100dvh-1rem)]', 'sm:max-h-[calc(100dvh-2rem)]', 'max-w-4xl', 'overflow-hidden');
  expect(modal.closest('[data-modal-viewport="true"]')).toBeInTheDocument();
  expect(screen.getByTestId('booking-modal-header')).toHaveClass('shrink-0');
  const closeButton = screen.getByRole('button', { name: 'Close booking details' });
  expect(closeButton).toBeVisible();
  await waitFor(() => expect(closeButton).toHaveFocus());
  expect(document.body).toHaveStyle({ overflow: 'hidden' });
  expect(screen.getByTestId('booking-modal-content')).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto', 'overscroll-contain');
  expect(screen.getByTestId('booking-modal-footer')).toHaveClass('shrink-0');

  const summary = screen.getByTestId('booking-summary-grid');
  expect(summary).toHaveClass('grid-cols-1', 'md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]');
  expect(screen.getByTestId('booking-service-name')).toHaveClass('break-words');
  expect(screen.getByTestId('booking-service-name')).not.toHaveClass('break-all');
});

test('booking proposal flow keeps Back separate from Close and preserves entered values', async () => {
  await openBookingModal();
  expect(screen.getByRole('button', { name: 'Continue to Staff Assignment' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Back to Details' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Continue to Staff Assignment' }));
  expect(await screen.findByRole('button', { name: 'Back to Details' })).toBeInTheDocument();

  const instructions = await screen.findByRole('textbox', { name: 'Customer-visible proposal instructions' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Qualified staff' }), { target: { value: 'vet-2' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Estimated duration in minutes' }), { target: { value: '75' } });
  fireEvent.change(instructions, { target: { value: 'Bring vaccination records.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Back to Details' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue to Staff Assignment' }));

  expect(screen.getByRole('combobox', { name: 'Qualified staff' })).toHaveValue('vet-2');
  expect(screen.getByRole('spinbutton', { name: 'Estimated duration in minutes' })).toHaveValue(75);
  expect(screen.getByRole('textbox', { name: 'Customer-visible proposal instructions' })).toHaveValue('Bring vaccination records.');
  expect(adminBookingService.updateBookingStatus).not.toHaveBeenCalled();
  await waitFor(() => expect(adminBookingService.getEligibleStaff).toHaveBeenCalledWith(booking._id));
});

test('Escape closes booking details without cancelling the booking', async () => {
  await openBookingModal();

  fireEvent.keyDown(document, { key: 'Escape' });

  await waitFor(() => expect(screen.queryByRole('dialog', { name: /123456789012/i })).not.toBeInTheDocument());
  expect(adminBookingService.updateBookingStatus).not.toHaveBeenCalled();
});
