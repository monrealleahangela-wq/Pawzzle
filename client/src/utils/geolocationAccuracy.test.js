import {
  chooseMoreAccuratePosition,
  getAccurateCurrentPosition,
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

test('rejects a coarse reading instead of presenting it as precise', async () => {
  jest.useFakeTimers();
  const geolocation = {
    watchPosition: jest.fn(success => {
      success(browserPosition(14.4, 120.9, 420));
      return 7;
    }),
    clearWatch: jest.fn()
  };

  const result = getAccurateCurrentPosition({ geolocation, timeout: 100 });
  jest.advanceTimersByTime(100);
  await expect(result).rejects.toMatchObject({
    code: 'LOW_ACCURACY',
    accuracy: 420,
    bestPosition: expect.objectContaining({ lat: 14.4, lng: 120.9, accuracy: 420 })
  });
  expect(getLocationErrorMessage({ code: 'LOW_ACCURACY', accuracy: 420 })).toMatch(/place the pin manually/i);
  jest.useRealTimers();
});
