const axios = require('axios');

const DEFAULT_BASE_URL = 'https://nominatim.openstreetmap.org';
const CAVITE_BOUNDS = Object.freeze({ south: 13.95, west: 120.55, north: 14.55, east: 121.15 });
const REQUEST_INTERVAL_MS = 1100;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;

const cache = new Map();
let requestQueue = Promise.resolve();
let nextRequestAt = 0;

const firstValue = (source, keys) => keys
  .map(key => String(source?.[key] || '').trim())
  .find(Boolean) || '';

const asNumber = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const isInsideCaviteBounds = (lat, lng) => lat >= CAVITE_BOUNDS.south
  && lat <= CAVITE_BOUNDS.north
  && lng >= CAVITE_BOUNDS.west
  && lng <= CAVITE_BOUNDS.east;

const isCaviteResult = result => {
  const lat = asNumber(result?.lat);
  const lng = asNumber(result?.lon);
  const address = result?.address || {};
  const province = firstValue(address, ['state', 'province', 'region']);
  return lat !== null && lng !== null
    && isInsideCaviteBounds(lat, lng)
    && (province.toLowerCase().includes('cavite') || String(result?.display_name || '').toLowerCase().includes('cavite'));
};

const normalizeLocation = result => {
  if (!isCaviteResult(result)) return null;
  const address = result.address || {};
  const barangay = firstValue(address, [
    'village', 'neighbourhood', 'quarter', 'residential', 'allotments',
    'city_block', 'suburb', 'subdivision', 'hamlet', 'locality',
    'city_district', 'district', 'borough'
  ]);
  return {
    lat: asNumber(result.lat),
    lng: asNumber(result.lon),
    full: String(result.display_name || '').trim(),
    street: firstValue(address, ['road', 'pedestrian', 'path', 'building', 'house_name']) || barangay,
    barangay,
    city: firstValue(address, ['city', 'town', 'municipality']),
    province: firstValue(address, ['state', 'province', 'region']),
    zipCode: String(address.postcode || '').trim()
  };
};

const pruneCache = () => {
  while (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
};

const cachedRequest = async (key, request) => {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) cache.delete(key);

  const queued = requestQueue.then(async () => {
    const waitMs = Math.max(0, nextRequestAt - Date.now());
    if (waitMs) await new Promise(resolve => setTimeout(resolve, waitMs));
    nextRequestAt = Date.now() + REQUEST_INTERVAL_MS;
    return request();
  });
  requestQueue = queued.catch(() => undefined);
  const value = await queued;
  pruneCache();
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
};

const requestOptions = params => ({
  params,
  timeout: 8000,
  headers: {
    Accept: 'application/json',
    'Accept-Language': 'en',
    'User-Agent': 'Pawzzle/1.0 (+https://pawzzle.io)'
  }
});

const searchLocations = async query => {
  const cleaned = String(query || '').trim().slice(0, 200);
  if (cleaned.length < 3) return [];
  const key = `search:${cleaned.toLowerCase()}`;
  const baseUrl = String(process.env.OPENSTREETMAP_SEARCH_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  const results = await cachedRequest(key, async () => {
    const response = await axios.get(`${baseUrl}/search`, requestOptions({
      q: `${cleaned}, Cavite, Philippines`,
      format: 'jsonv2',
      addressdetails: 1,
      limit: 5,
      countrycodes: 'ph',
      viewbox: `${CAVITE_BOUNDS.west},${CAVITE_BOUNDS.north},${CAVITE_BOUNDS.east},${CAVITE_BOUNDS.south}`,
      bounded: 1
    }));
    return Array.isArray(response.data) ? response.data : [];
  });
  return results.map(normalizeLocation).filter(Boolean);
};

const reverseLocation = async (latValue, lngValue) => {
  const lat = asNumber(latValue);
  const lng = asNumber(lngValue);
  if (lat === null || lng === null || !isInsideCaviteBounds(lat, lng)) return null;
  const key = `reverse:${lat.toFixed(6)},${lng.toFixed(6)}`;
  const baseUrl = String(process.env.OPENSTREETMAP_SEARCH_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  const result = await cachedRequest(key, async () => {
    const response = await axios.get(`${baseUrl}/reverse`, requestOptions({
      lat,
      lon: lng,
      format: 'jsonv2',
      addressdetails: 1,
      zoom: 18
    }));
    return response.data || null;
  });
  return normalizeLocation(result);
};

module.exports = {
  CAVITE_BOUNDS,
  isInsideCaviteBounds,
  normalizeLocation,
  reverseLocation,
  searchLocations
};
