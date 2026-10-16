import fs from 'fs';

const source = fs.readFileSync(__dirname + '/Bookings.js', 'utf8');
const submission = source.slice(
  source.indexOf('const handleBookingSubmit'),
  source.indexOf('{/* Existing Bookings Header */}')
);

describe('service booking submission contract', () => {
  test('keeps physical check-in server-owned for regular and grooming bookings', () => {
    expect(submission).toMatch(/serviceIntake:\s*buildServiceIntake\(serviceBookingKind/);
    expect(submission).toMatch(/bookingService\.createBooking\(bookingData\)/);
    expect(submission).not.toMatch(/checkInMethod\s*:/);
  });

  test('blocks rapid duplicate submit events until the request settles', () => {
    expect(source).toMatch(/const bookingSubmissionInFlight = useRef\(false\)/);
    expect(submission).toMatch(/if \(bookingSubmissionInFlight\.current\) return/);
    expect(submission).toMatch(/bookingSubmissionInFlight\.current = true/);
    expect(submission).toMatch(/finally[\s\S]*bookingSubmissionInFlight\.current = false/);
    expect(source).toMatch(/type="submit" disabled=\{submitting\}/);
  });
});
