import { durationPartsToMinutes, formatDurationMinutes } from './durationFormat';

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

describe('durationPartsToMinutes', () => {
  test.each([
    ['8', '30', 510],
    ['1', '', 60],
    ['', '45', 45],
    ['', '', 0]
  ])('converts %s hours and %s minutes to %s exact minutes', (hours, minutes, expected) => {
    expect(durationPartsToMinutes(hours, minutes)).toBe(expected);
  });

  test.each([
    ['1.5', '0'],
    ['1', '60'],
    ['-1', '0'],
    ['1', '-1'],
    ['hours', '15']
  ])('rejects invalid duration parts (%s, %s)', (hours, minutes) => {
    expect(durationPartsToMinutes(hours, minutes)).toBeNull();
  });
});
