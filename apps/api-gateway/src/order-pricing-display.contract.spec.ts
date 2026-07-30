import { normalizeOrderLine, normalizeOrderPricing } from '@aagam/utils';

describe('customer order pricing display', () => {
  test('reads paise-only pricing snapshots used by checkout', () => {
    expect(normalizeOrderPricing({
      pricingSnapshot: {
        subtotalPaise: 7800,
        deliveryFeePaise: 0,
        discountPaise: 0,
        taxPaise: 0,
        grandTotalPaise: 7800,
      },
    })).toEqual({
      subtotal: 78,
      deliveryFee: 0,
      discountAmount: 0,
      taxAmount: 0,
      grandTotal: 78,
    });
  });

  test('recovers legacy zero totals from item prices and quantities', () => {
    const items = [{ quantity: 3, price: 26 }];
    expect(normalizeOrderLine(items[0]).lineTotal).toBe(78);
    expect(normalizeOrderPricing({ grandTotal: 0, totalAmount: 0 }, items).grandTotal).toBe(78);
  });
});
