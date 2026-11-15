const firstAddressValue = (address, keys) => keys
  .map(key => String(address?.[key] || '').trim())
  .find(Boolean) || '';

export const normalizeNominatimAddress = data => {
  const address = data?.address || {};
  const barangay = firstAddressValue(address, [
    'village',
    'neighbourhood',
    'quarter',
    'residential',
    'allotments',
    'city_block',
    'suburb',
    'subdivision',
    'hamlet',
    'locality',
    'city_district',
    'district',
    'borough'
  ]);

  return {
    street: firstAddressValue(address, ['road', 'pedestrian', 'path', 'building', 'house_name']) || barangay,
    city: firstAddressValue(address, ['city', 'town', 'municipality']),
    barangay,
    zipCode: String(address.postcode || '').trim(),
    full: String(data?.display_name || '').trim()
  };
};

export const toLocationOptionValue = value => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, '_')
  .replace(/^municipality_of_/, '');
