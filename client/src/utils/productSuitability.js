const SPECIES_LABELS = Object.freeze({
  dog: 'Dogs',
  cat: 'Cats',
  bird: 'Birds',
  fish: 'Fish',
  rabbit: 'Rabbits',
  hamster: 'Hamsters',
  reptile: 'Reptiles'
});

const LEGACY_NAME_PATTERNS = Object.freeze({
  dog: /\b(dogs?|pupp(?:y|ies)\w*|canine)\b/i,
  cat: /\b(cat|cats|kitten|kittens|feline)\b/i,
  bird: /\b(bird|birds|avian)\b/i,
  fish: /\b(fish|aquatic)\b/i,
  rabbit: /\b(rabbit|rabbits|bunny|bunnies)\b/i,
  hamster: /\b(hamster|hamsters)\b/i,
  reptile: /\b(reptile|reptiles)\b/i
});

const productSuitabilityLabel = product => {
  const suitableFor = (Array.isArray(product?.suitableFor) ? product.suitableFor : [])
    .map(value => String(value).trim().toLowerCase())
    .filter(Boolean);

  if (suitableFor.includes('all')) return 'All pets';

  const explicitSpecies = [...new Set(suitableFor)]
    .filter(species => SPECIES_LABELS[species]);
  if (explicitSpecies.length) {
    return explicitSpecies.map(species => SPECIES_LABELS[species]).join(', ');
  }

  // Older listings could be created without suitableFor. Only infer from the
  // product name and tags, where species wording is an explicit catalog cue.
  const legacyCatalogText = [product?.name, ...(Array.isArray(product?.tags) ? product.tags : [])]
    .filter(Boolean)
    .join(' ');
  const inferredSpecies = Object.entries(LEGACY_NAME_PATTERNS)
    .filter(([, pattern]) => pattern.test(legacyCatalogText))
    .map(([species]) => SPECIES_LABELS[species]);

  return inferredSpecies.length ? inferredSpecies.join(', ') : 'Not specified';
};

export default productSuitabilityLabel;
