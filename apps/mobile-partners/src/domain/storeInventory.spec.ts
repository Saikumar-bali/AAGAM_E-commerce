import {
  availableForSale,
  defaultDraft,
  normalizeOptionalPrice,
  normalizeWholeQuantity,
} from './storeInventory';

describe('store inventory domain helpers', () => {
  it('normalizes opening and adjustment quantities as non-negative whole numbers', () => {
    expect(normalizeWholeQuantity('12')).toBe(12);
    expect(normalizeWholeQuantity('12.9')).toBe(12);
    expect(normalizeWholeQuantity('-5')).toBe(0);
    expect(normalizeWholeQuantity('invalid')).toBe(0);
  });

  it('normalizes optional store prices without inventing invalid values', () => {
    expect(normalizeOptionalPrice('39.995')).toBe(40);
    expect(normalizeOptionalPrice('')).toBeNull();
    expect(normalizeOptionalPrice('-1')).toBeNull();
    expect(normalizeOptionalPrice('invalid')).toBeNull();
  });

  it('uses Admin price when no store-specific price exists', () => {
    expect(defaultDraft(25, null)).toEqual({ quantity: '25', sellingPrice: '' });
    expect(defaultDraft(25, 3999)).toEqual({ quantity: '25', sellingPrice: '39.99' });
  });

  it('applies store listing and out-of-stock visibility rules', () => {
    expect(availableForSale({ quantity: 5, isListed: true, autoHideWhenOutOfStock: true })).toBe(true);
    expect(availableForSale({ quantity: 0, isListed: true, autoHideWhenOutOfStock: true })).toBe(false);
    expect(availableForSale({ quantity: 0, isListed: true, autoHideWhenOutOfStock: false })).toBe(true);
    expect(availableForSale({ quantity: 10, isListed: false, autoHideWhenOutOfStock: false })).toBe(false);
  });
});
