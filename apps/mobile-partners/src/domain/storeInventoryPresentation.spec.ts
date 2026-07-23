import {
  effectiveStoreSellingPricePaise,
  productMrpPaise,
  productSellingPricePaise,
} from './storeInventoryPresentation';

describe('store inventory price presentation', () => {
  const product = { price: 95, pricePaise: 9500, mrpPaise: 10000 };

  it('shows the Store Owner selling-price override instead of MRP', () => {
    expect(effectiveStoreSellingPricePaise(product, 9200)).toBe(9200);
    expect(productMrpPaise(product, 9200)).toBe(10000);
  });

  it('inherits the Admin selling price when the store has no override', () => {
    expect(effectiveStoreSellingPricePaise(product, null)).toBe(9500);
  });

  it('supports legacy products that only contain a rupee price', () => {
    expect(productSellingPricePaise({ price: 87.5 })).toBe(8750);
  });

  it('never renders an MRP below the effective selling price', () => {
    expect(productMrpPaise({ price: 100, pricePaise: 10000, mrpPaise: 9000 }, 10000)).toBe(10000);
  });
});
