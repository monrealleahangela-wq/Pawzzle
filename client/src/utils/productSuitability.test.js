import productSuitabilityLabel from './productSuitability';

test('uses the product suitability saved in the catalog', () => {
  expect(productSuitabilityLabel({ suitableFor: ['dog'] })).toBe('Dogs');
  expect(productSuitabilityLabel({ suitableFor: ['dog', 'cat'] })).toBe('Dogs, Cats');
  expect(productSuitabilityLabel({ suitableFor: ['all'] })).toBe('All pets');
});

test('does not call a product suitable for all pets when suitability is missing', () => {
  expect(productSuitabilityLabel({ name: 'PuppyGrow Chicken Formula', suitableFor: [] })).toBe('Dogs');
  expect(productSuitabilityLabel({ name: 'Daily Nutrition Formula' })).toBe('Not specified');
});
