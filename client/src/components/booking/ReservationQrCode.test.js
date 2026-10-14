import { createReservationQrPath } from './ReservationQrCode';

test('renders a machine-readable QR matrix for the opaque reservation token', () => {
  const path = createReservationQrPath('PZQ1.test-opaque-token');
  expect(path).toMatch(/^M\d+ \d+h1v1h-1z/);
  expect(path.length).toBeGreaterThan(1000);
});

test('does not generate a QR graphic for a missing token', () => {
  expect(createReservationQrPath('')).toBe('');
  expect(createReservationQrPath(null)).toBe('');
});
