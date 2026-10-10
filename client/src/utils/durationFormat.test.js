import { formatDurationMinutes } from './durationFormat';

describe('formatDurationMinutes', () => {
  test.each([
    [30, '30m'],
    [75, '1h 15m'],
    [480, '8h'],
    [510, '8h 30m'],
    [0, '0m']
  ])('formats %s exact minutes as %s', (minutes, expected) => {
    expect(formatDurationMinutes(minutes)).toBe(expected);
  });

  test('does not discard fractional minute data if received', () => {
    expect(formatDurationMinutes(75.5)).toBe('1h 15.5m');
    expect(formatDurationMinutes(undefined)).toBe('—');
  });
});
