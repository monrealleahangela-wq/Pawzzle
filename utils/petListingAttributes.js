const PET_SPECIES = Object.freeze(['dog', 'cat', 'bird', 'fish', 'rabbit', 'hamster', 'reptile', 'other']);
const PET_SIZES = Object.freeze(['small', 'medium', 'large', 'extra_large']);
const PET_TEMPERAMENT_TRAITS = Object.freeze([
  'calm',
  'energetic',
  'affectionate',
  'independent',
  'social',
  'outdoor',
  'interactive'
]);
const PET_ACTIVITY_LEVELS = Object.freeze(['low', 'moderate', 'high', 'unknown']);
const PET_CARE_LEVELS = Object.freeze(['low', 'moderate', 'high', 'unknown']);
const PET_COMPATIBILITY_LEVELS = Object.freeze(['compatible', 'not_compatible', 'unknown']);

module.exports = {
  PET_SPECIES,
  PET_SIZES,
  PET_TEMPERAMENT_TRAITS,
  PET_ACTIVITY_LEVELS,
  PET_CARE_LEVELS,
  PET_COMPATIBILITY_LEVELS
};
