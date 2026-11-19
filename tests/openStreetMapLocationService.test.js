const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const axios = require('axios');
const {
  isInsideCaviteBounds,
  normalizeLocation,
  searchLocations
} = require('../services/openStreetMapLocationService');

test('normalizes only Cavite map results into the store address contract', () => {
  const location = normalizeLocation({
    lat: '14.4297',
    lon: '120.9367',
    display_name: 'Aguinaldo Highway, Anabu I-A, Imus, Cavite, Philippines',
    address: {
      road: 'Aguinaldo Highway',
      village: 'Anabu I-A',
      city: 'Imus',
      state: 'Cavite',
      postcode: '4103'
    }
  });

  assert.deepEqual(location, {
    lat: 14.4297,
    lng: 120.9367,
    full: 'Aguinaldo Highway, Anabu I-A, Imus, Cavite, Philippines',
    street: 'Aguinaldo Highway',
    barangay: 'Anabu I-A',
    city: 'Imus',
    province: 'Cavite',
    zipCode: '4103'
  });
  assert.equal(isInsideCaviteBounds(14.5995, 120.9842), false);
});

test('searches the key-free provider with a bounded, identifiable server request', async () => {
  const originalGet = axios.get;
  let request;
  axios.get = async (url, options) => {
    request = { url, options };
    return { data: [{
      lat: '14.4297', lon: '120.9367', display_name: 'Imus, Cavite, Philippines',
      address: { city: 'Imus', state: 'Cavite' }
    }] };
  };

  try {
    const locations = await searchLocations('Imus City Hall unique-test-location');
    assert.equal(locations.length, 1);
    assert.equal(request.url, 'https://nominatim.openstreetmap.org/search');
    assert.equal(request.options.params.bounded, 1);
    assert.equal(request.options.params.countrycodes, 'ph');
    assert.match(request.options.headers['User-Agent'], /Pawzzle/);
  } finally {
    axios.get = originalGet;
  }
});

test('protects location lookup routes with authentication and per-account limits', () => {
  const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'storeApplications.js'), 'utf8');
  assert.match(routes, /router\.get\('\/location\/search', authenticate, authRateLimits\.storeLocationLookup, searchStoreLocations\)/);
  assert.match(routes, /router\.get\('\/location\/reverse', authenticate, authRateLimits\.storeLocationLookup, reverseStoreLocation\)/);
});
