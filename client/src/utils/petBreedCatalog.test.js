import { getBreedOptions, PET_TYPE_OPTIONS } from './petBreedCatalog';

describe('pet breed catalog', () => {
  test('provides booking pet types from the shared pet contract', () => {
    expect(PET_TYPE_OPTIONS.map(option => option.value)).toEqual([
      'Dog', 'Cat', 'Bird', 'Rabbit', 'Hamster', 'Other'
    ]);
  });

  test('returns only breeds associated with the selected pet type', () => {
    expect(getBreedOptions('Dog')).toContain('Golden Retriever');
    expect(getBreedOptions('Dog')).not.toContain('Persian');
    expect(getBreedOptions('Cat')).toContain('Persian');
    expect(getBreedOptions('Cat')).not.toContain('Golden Retriever');
    expect(getBreedOptions('Bird')).toContain('Cockatiel');
  });

  test('normalizes pet type casing and rejects unknown types', () => {
    expect(getBreedOptions('  rabbit ')).toContain('Holland Lop');
    expect(getBreedOptions('reptile')).toEqual([]);
  });
});
