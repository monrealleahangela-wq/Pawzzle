import {
  calculateRouteProgress,
  distanceBetweenMeters,
  formatRouteInstruction,
  parseOsrmRoute
} from './shopNavigation';

test('builds readable guidance from OSRM maneuver fields', () => {
  expect(formatRouteInstruction({ name: 'Aguinaldo Highway', maneuver: { type: 'turn', modifier: 'left' } }))
    .toBe('Turn left onto Aguinaldo Highway');
  expect(formatRouteInstruction({ name: 'Molino Boulevard', maneuver: { type: 'depart', modifier: 'right' } }))
    .toBe('Head right onto Molino Boulevard');
  expect(formatRouteInstruction({ name: 'Daang Hari', maneuver: { type: 'roundabout', exit: 2 } }))
    .toBe('Enter the roundabout and take exit 2 onto Daang Hari');
  expect(formatRouteInstruction({ maneuver: { type: 'arrive' } })).toBe('Arrive at your destination');
});

test('normalizes route geometry, time, distance, and upcoming steps', () => {
  const parsed = parseOsrmRoute({
    code: 'Ok',
    routes: [{
      distance: 14125,
      duration: 901,
      geometry: { coordinates: [[120.9, 14.3], [120.91, 14.31]] },
      legs: [{ steps: [
        { distance: 180, name: 'Diamond Street', maneuver: { type: 'depart', modifier: 'right', location: [120.9, 14.3] } },
        { distance: 900, name: 'Molino Road', maneuver: { type: 'turn', modifier: 'left', location: [120.91, 14.31] } }
      ] }]
    }]
  });

  expect(parsed.coordinates).toEqual([[14.3, 120.9], [14.31, 120.91]]);
  expect(parsed.distanceKm).toBeCloseTo(14.125);
  expect(parsed.etaMinutes).toBe(16);
  expect(parsed.directions[0]).toEqual(expect.objectContaining({
    instruction: 'Head right onto Diamond Street',
    distanceLabel: 'In 180 m'
  }));
});

test('rejects an unusable routing response instead of showing false guidance', () => {
  expect(() => parseOsrmRoute({ code: 'NoRoute', routes: [] })).toThrow('No usable driving route');
});

test('tracks meaningful movement and clamps route progress', () => {
  expect(distanceBetweenMeters({ lat: 14.3, lng: 120.9 }, { lat: 14.3, lng: 120.9 })).toBe(0);
  expect(distanceBetweenMeters({ lat: 14.3, lng: 120.9 }, { lat: 14.301, lng: 120.9 })).toBeGreaterThan(100);
  expect(calculateRouteProgress(10000, 7500)).toBe(25);
  expect(calculateRouteProgress(10000, -10)).toBe(100);
  expect(calculateRouteProgress(0, 0)).toBe(0);
});
