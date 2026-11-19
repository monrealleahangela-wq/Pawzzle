const {
  reverseLocation,
  searchLocations
} = require('../services/openStreetMapLocationService');

const friendlyFailure = (res, error) => {
  console.error('Store location lookup failed:', error.message);
  return res.status(503).json({
    message: 'Address search is unavailable right now. You can still place the pin manually or enter the address.'
  });
};

const searchStoreLocations = async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    if (query.length < 3) return res.status(400).json({ message: 'Enter at least 3 characters to search.' });
    const locations = await searchLocations(query);
    return res.json({ locations });
  } catch (error) {
    return friendlyFailure(res, error);
  }
};

const reverseStoreLocation = async (req, res) => {
  try {
    const location = await reverseLocation(req.query.lat, req.query.lng);
    if (!location) return res.status(400).json({ message: 'Choose a location within Cavite.' });
    return res.json({ location });
  } catch (error) {
    return friendlyFailure(res, error);
  }
};

module.exports = { reverseStoreLocation, searchStoreLocations };
