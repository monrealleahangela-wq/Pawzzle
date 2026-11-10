import { getProcurementItemImage } from './procurementItemImage';

describe('getProcurementItemImage', () => {
  test('prefers the exact variant image over the parent product image', () => {
    expect(getProcurementItemImage({
      variant: { images: ['variant.jpg'] },
      product: { images: ['parent.jpg'] }
    })).toBe('variant.jpg');
  });

  test('uses the live animal image before the parent listing image', () => {
    expect(getProcurementItemImage({
      pet: { images: ['animal.jpg'] },
      product: { images: ['parent.jpg'] }
    })).toBe('animal.jpg');
  });

  test('falls back to the parent product image or no image', () => {
    expect(getProcurementItemImage({ product: { images: ['parent.jpg'] } })).toBe('parent.jpg');
    expect(getProcurementItemImage({ product: { images: [] } })).toBeNull();
  });
});
