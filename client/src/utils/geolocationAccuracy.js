export const DESIRED_GPS_ACCURACY_METERS = 30;
export const MAXIMUM_GPS_ACCURACY_METERS = 150;

const locationError = (code, message, details = {}) => Object.assign(new Error(message), {
  code,
  ...details
});
export const normalizeBrowserPosition = position => {
  const lat = Number(position?.coords?.latitude);
  const lng = Number(position?.coords?.longitude);
  const accuracy = Number(position?.coords?.accuracy);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90
      || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw locationError('INVALID_POSITION', 'Your device returned an invalid location.');
  }

  return {
    lat,
    lng,
    accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : Infinity,
    capturedAt: position?.timestamp || Date.now()
  };
};

export const chooseMoreAccuratePosition = (current, candidate) => {
  if (!current) return candidate;
  return candidate.accuracy < current.accuracy ? candidate : current;
};

export const getLocationErrorMessage = error => {
  if (error?.code === 'LOW_ACCURACY') {
    const rounded = Number.isFinite(error.accuracy) ? ` (about ±${Math.round(error.accuracy)} m)` : '';
    return `Location accuracy is too low${rounded}. Move near a window, enable precise location, or place the pin manually.`;
  }
  if (error?.code === 1 || error?.code === 'PERMISSION_DENIED') {
    return 'Location permission is required. Allow precise location access, then try again.';
  }
  if (error?.code === 3 || error?.code === 'TIMEOUT') {
    return 'Location detection timed out. Move near a window or place the pin manually.';
  }
  return error?.message || 'We could not determine your location. Place the pin manually or try again.';
};

export const getAccurateCurrentPosition = ({
  geolocation = typeof navigator !== 'undefined' ? navigator.geolocation : null,
  desiredAccuracy = DESIRED_GPS_ACCURACY_METERS,
  maximumAccuracy = MAXIMUM_GPS_ACCURACY_METERS,
  timeout = 15000
} = {}) => new Promise((resolve, reject) => {
  if (!geolocation) {
    reject(locationError('UNSUPPORTED', 'This device does not support location services.'));
    return;
  }

  let best = null;
  let settled = false;
  let watchId;
  let timer;

  const cleanup = () => {
    if (timer) clearTimeout(timer);
    if (watchId !== undefined && typeof geolocation.clearWatch === 'function') {
      geolocation.clearWatch(watchId);
    }
  };

  const finishWithBest = () => {
    if (settled) return;
    settled = true;
    cleanup();
    if (best && best.accuracy <= maximumAccuracy) {
      resolve(best);
      return;
    }
    reject(locationError(
      'LOW_ACCURACY',
      'The available location reading is not accurate enough.',
      {
        accuracy: best?.accuracy,
        // This is only a map-centering hint. The customer must still confirm it.
        bestPosition: best
      }
    ));
  };

  const handlePosition = position => {
    if (settled) return;
    try {
      best = chooseMoreAccuratePosition(best, normalizeBrowserPosition(position));
      if (best.accuracy <= desiredAccuracy) finishWithBest();
    } catch (error) {
      if (!best) {
        settled = true;
        cleanup();
        reject(error);
      }
    }
  };

  const handleError = error => {
    if (settled) return;
    if (best) {
      finishWithBest();
      return;
    }
    settled = true;
    cleanup();
    reject(error || locationError('UNAVAILABLE', 'Location is unavailable.'));
  };

  const options = { enableHighAccuracy: true, timeout, maximumAge: 0 };
  timer = setTimeout(finishWithBest, timeout);

  if (typeof geolocation.watchPosition === 'function') {
    watchId = geolocation.watchPosition(handlePosition, handleError, options);
    if (settled) cleanup();
    return;
  }

  geolocation.getCurrentPosition(position => {
    handlePosition(position);
    finishWithBest();
  }, handleError, options);
});
