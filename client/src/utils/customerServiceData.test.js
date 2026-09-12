import {
  formatRecordId,
  formatSafeDate,
  normalizeBookingCollection,
  normalizeBookingRecord,
  normalizeServiceDetail
} from './customerServiceData';
import { formatTime12h } from './timeFormatters';
import { resolveServiceBookingKind, SERVICE_BOOKING_KINDS } from './serviceBookingForm';

describe('customer service and booking compatibility', () => {
  test('normalizes legacy service shapes without inventing nested data', () => {
    const service = normalizeServiceDetail({
      id: 'service-1',
      title: 'Wellness Visit',
      category: { name: 'health_wellness' },
      basePrice: '450',
      duration: { value: '60' },
      store: 'store-1'
    });

    expect(service).toMatchObject({
      _id: 'service-1',
      name: 'Wellness Visit',
      category: 'health_wellness',
      price: 450,
      duration: 60,
      store: { _id: 'store-1', name: 'Store information unavailable' },
      images: []
    });
  });

  test('keeps historical bookings renderable when optional references are missing', () => {
    const booking = normalizeBookingRecord({
      _id: 'booking-legacy-123456789',
      bookingDate: null,
      startTime: { legacy: true },
      status: 'legacy_waiting',
      service: null,
      store: null,
      pet: null
    });

    expect(booking.service).toBeNull();
    expect(booking.store).toBeNull();
    expect(booking.pet.name).toBe('Pet information unavailable');
    expect(booking.startTime).toBe('');
    expect(formatTime12h(booking.startTime)).toBe('Time unavailable');
    expect(formatSafeDate(booking.bookingDate)).toBe('Date unavailable');
    expect(formatRecordId(booking._id)).toBe('CY-123456789');
  });

  test('non-array booking responses safely become an empty history', () => {
    expect(normalizeBookingCollection(undefined)).toEqual([]);
    expect(normalizeBookingCollection({ bookings: [] })).toEqual([]);
  });

  test('booking kind resolution accepts the initial null service selection', () => {
    expect(resolveServiceBookingKind(null)).toBe(SERVICE_BOOKING_KINDS.GENERAL);
  });

  test('normalizes legacy nested payment status for booking history', () => {
    expect(normalizeBookingRecord({ _id: 'booking-1', payment: { status: 'paid' } }).paymentStatus).toBe('paid');
  });
});
