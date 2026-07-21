import {
  availableForSale,
  defaultDraft,
  parseWholeQuantity,
  validateStoreInventoryDraft,
} from './storeInventory';

describe('store inventory domain helpers', () => {
  it('accepts only explicit non-negative whole quantities', () => {
    expect(parseWholeQuantity('12')).toBe(12);
    expect(parseWholeQuantity('')).toBeNull();
    expect(parseWholeQuantity('12.9')).toBeNull();
    expect(parseWholeQuantity('-5')).toBeNull();
    expect(parseWholeQuantity('invalid')).toBeNull();
    expect(parseWholeQuantity('1000001')).toBeNull();
  });

  it('validates a complete mutation draft without inventing values', () => {
    expect(validateStoreInventoryDraft({ quantity: '12', sellingPrice: '39.995' })).toEqual({
      valid: true,
      quantity: 12,
      sellingPrice: 40,
    });
    expect(validateStoreInventoryDraft({ quantity: '12', sellingPrice: '' })).toEqual({
      valid: true,
      quantity: 12,
      sellingPrice: null,
    });
    expect(validateStoreInventoryDraft({ quantity: '', sellingPrice: '40' }).valid).toBe(false);
    expect(validateStoreInventoryDraft({ quantity: '12.5', sellingPrice: '40' }).valid).toBe(false);
    expect(validateStoreInventoryDraft({ quantity: '12', sellingPrice: '-1' }).valid).toBe(false);
    expect(validateStoreInventoryDraft({ quantity: '12', sellingPrice: 'invalid' }).valid).toBe(false);
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
