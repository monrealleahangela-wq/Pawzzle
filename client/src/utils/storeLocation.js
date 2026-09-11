const CAVITE_LOCALITIES = new Set([
  'alfonso', 'amadeo', 'bacoor', 'carmona', 'cavite city', 'dasmarinas',
  'general emilio aguinaldo', 'general mariano alvarez', 'general trias',
  'imus', 'indang', 'kawit', 'magallanes', 'maragondon', 'mendez', 'naic',
  'noveleta', 'rosario', 'silang', 'tagaytay', 'tanza', 'ternate',
  'trece martires'
]);

const normalizePlace = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

export const isCaviteAddress = address => {
  if (!address) return false;
  const state = normalizePlace(address.state || address.province);
  const city = normalizePlace(address.city);
  return state.includes('cavite') || CAVITE_LOCALITIES.has(city);
};

export const hasMapCoordinates = store => {
  const coordinates = store?.contactInfo?.address?.coordinates;
  return Number.isFinite(Number(coordinates?.lat)) && Number.isFinite(Number(coordinates?.lng));
};
