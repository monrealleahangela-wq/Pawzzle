import {
  chooseMoreAccuratePosition,
  getAccurateCurrentPosition,
  getLocationAccuracyPresentation,
  getLocationErrorMessage,
  normalizeBrowserPosition
} from './geolocationAccuracy';

const browserPosition = (latitude, longitude, accuracy) => ({
  coords: { latitude, longitude, accuracy },
  timestamp: 123
});
test('normalizes a browser reading and keeps the most accurate sample', () => {
  const coarse = normalizeBrowserPosition(browserPosition(14.4, 120.9, 90));
  const precise = normalizeBrowserPosition(browserPosition(14.4001, 120.9001, 12));

  expect(coarse).toEqual({ lat: 14.4, lng: 120.9, accuracy: 90, capturedAt: 123 });
  expect(chooseMoreAccuratePosition(coarse, precise)).toBe(precise);
  expect(chooseMoreAccuratePosition(precise, coarse)).toBe(precise);
});

test('resolves the best high-accuracy watch reading and clears the watch', async () => {
  const geolocation = {
    watchPosition: jest.fn(success => {
      success(browserPosition(14.4, 120.9, 75));
      success(browserPosition(14.4002, 120.9002, 18));
      return 41;
    }),
    clearWatch: jest.fn()
  };

  await expect(getAccurateCurrentPosition({ geolocation, timeout: 1000 })).resolves.toMatchObject({
    lat: 14.4002,
    lng: 120.9002,
    accuracy: 18
  });
  expect(geolocation.clearWatch).toHaveBeenCalledWith(41);
});

test('accepts a usable desktop reading after allowing time for refinement', async () => {
  jest.useFakeTimers();
  const geolocation = {
    watchPosition: jest.fn(success => {
      success(browserPosition(14.4, 120.9, 202));
      return 7;
    }),
    clearWatch: jest.fn()
  };

  const result = getAccurateCurrentPosition({ geolocation, timeout: 5000, refinementWindow: 100 });
  jest.advanceTimersByTime(100);
  await expect(result).resolves.toMatchObject({ lat: 14.4, lng: 120.9, accuracy: 202 });
  expect(getLocationAccuracyPresentation(202)).toMatchObject({
    level: 'approximate',
    label: expect.stringMatching(/about ±202 m/i),
    guidance: expect.stringMatching(/drag the pin/i)
  });
  expect(geolocation.clearWatch).toHaveBeenCalledWith(7);
  jest.useRealTimers();
});

test('rejects a genuinely unusable reading', async () => {
  jest.useFakeTimers();
  const geolocation = {
    watchPosition: jest.fn(success => {
      success(browserPosition(14.4, 120.9, 1200));
      return 9;
    }),
    clearWatch: jest.fn()
  };

  const result = getAccurateCurrentPosition({ geolocation, timeout: 100 });
  jest.advanceTimersByTime(100);
  await expect(result).rejects.toMatchObject({ code: 'LOW_ACCURACY', accuracy: 1200 });
  expect(getLocationErrorMessage({ code: 'LOW_ACCURACY', accuracy: 1200 })).toMatch(/place the pin manually/i);
  jest.useRealTimers();
});
