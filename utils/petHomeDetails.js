const SUITABILITY_VALUES = Object.freeze(['suitable', 'conditional', 'not_suitable']);
const LIVING_SPACE_VALUES = Object.freeze(['small_home', 'medium_home', 'large_home']);

const COMMON_TEXT_FIELDS = Object.freeze([
  'ventilationNotes', 'environmentNotes', 'climateNotes', 'exerciseSpaceNotes',
  'speciesCareNotes', 'additionalRequirements'
]);
const SPECIES_TEXT_FIELDS = Object.freeze({
  cat: ['verticalSpaceNotes', 'safeOutdoorAccessNotes'],
  bird: ['flightSpaceNotes'],
  fish: ['filtrationNotes', 'waterNotes'],
  rabbit: ['activitySpaceNotes'],
  hamster: ['activitySpaceNotes'],
  reptile: ['lightingNotes']
});
const SPECIES_NUMBER_FIELDS = Object.freeze({
  bird: ['enclosureLengthCm', 'enclosureWidthCm', 'enclosureHeightCm'],
  fish: ['aquariumVolumeLiters'],
  rabbit: ['enclosureLengthCm', 'enclosureWidthCm', 'enclosureHeightCm'],
  hamster: ['enclosureLengthCm', 'enclosureWidthCm', 'enclosureHeightCm'],
  reptile: ['enclosureLengthCm', 'enclosureWidthCm', 'enclosureHeightCm',
    'temperatureMinC', 'temperatureMaxC', 'humidityMinPercent', 'humidityMaxPercent']
});
const SUITABILITY_FIELDS = Object.freeze(['indoor', 'outdoor', 'apartment', 'smallHome', 'largeHome']);
const NUMBER_FIELDS = Object.freeze([...new Set(Object.values(SPECIES_NUMBER_FIELDS).flat())]);
const TEXT_FIELDS = Object.freeze([...new Set([...COMMON_TEXT_FIELDS, ...Object.values(SPECIES_TEXT_FIELDS).flat()])]);

const allowedFieldsForSpecies = species => new Set([
  'minimumLivingSpace', ...SUITABILITY_FIELDS, ...COMMON_TEXT_FIELDS,
  ...(SPECIES_TEXT_FIELDS[species] || []), ...(SPECIES_NUMBER_FIELDS[species] || [])
]);

const invalidHomeDetails = message => Object.assign(new Error(message), { statusCode: 400 });

const normalizePetHomeDetails = (value, species) => {
  if (value === undefined) return undefined;
  if (value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw invalidHomeDetails('Home Details must be an object.');
  const allowed = allowedFieldsForSpecies(species);
  const result = {};
  for (const [field, raw] of Object.entries(value)) {
    if (!allowed.has(field)) throw invalidHomeDetails(`${field} is not a Home Details field for this species.`);
    if (raw === '' || raw === null || raw === undefined) continue;
    if (field === 'minimumLivingSpace' || SUITABILITY_FIELDS.includes(field)) {
      const options = field === 'minimumLivingSpace' ? LIVING_SPACE_VALUES : SUITABILITY_VALUES;
      if (typeof raw !== 'string' || !options.includes(raw)) throw invalidHomeDetails(`Invalid ${field} value.`);
      result[field] = raw;
    } else if (NUMBER_FIELDS.includes(field)) {
      if (typeof raw !== 'number' && (typeof raw !== 'string' || !raw.trim())) throw invalidHomeDetails(`Invalid ${field} value.`);
      const number = Number(raw);
      const min = field.startsWith('temperature') ? -50 : field.startsWith('humidity') ? 0 : 0.01;
      const max = field.startsWith('temperature') ? 80 : field.startsWith('humidity') ? 100 : 100000;
      if (!Number.isFinite(number) || number < min || number > max) throw invalidHomeDetails(`Invalid ${field} value.`);
      result[field] = number;
    } else {
      if (typeof raw !== 'string' || raw.trim().length > 1000) throw invalidHomeDetails(`Invalid ${field} value.`);
      if (raw.trim()) result[field] = raw.trim();
    }
  }
  if (result.temperatureMinC !== undefined && result.temperatureMaxC !== undefined
      && result.temperatureMinC > result.temperatureMaxC) throw invalidHomeDetails('Minimum temperature exceeds maximum temperature.');
  if (result.humidityMinPercent !== undefined && result.humidityMaxPercent !== undefined
      && result.humidityMinPercent > result.humidityMaxPercent) throw invalidHomeDetails('Minimum humidity exceeds maximum humidity.');
  return result;
};

const keepCommonHomeDetails = value => Object.fromEntries(
  Object.entries(value?.toObject?.() || value || {}).filter(([field]) =>
    allowedFieldsForSpecies('dog').has(field) && field !== '_id')
);

module.exports = {
  SUITABILITY_VALUES, LIVING_SPACE_VALUES, COMMON_TEXT_FIELDS, SPECIES_TEXT_FIELDS,
  SPECIES_NUMBER_FIELDS, SUITABILITY_FIELDS, NUMBER_FIELDS, TEXT_FIELDS,
  normalizePetHomeDetails, keepCommonHomeDetails
};
