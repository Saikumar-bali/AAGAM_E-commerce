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

  test('skips zero-default mutable fields before historical snapshot pricing', () => {
    expect(normalizeOrderPricing({
      subtotal: 0,
      subtotalPaise: 0,
      deliveryFee: 0,
      deliveryFeePaise: 0,
      discountAmount: 0,
      discountPaise: 0,
      taxAmount: 0,
      taxPaise: 0,
      grandTotal: 0,
      grandTotalPaise: 0,
      totalAmount: 0,
      pricingSnapshot: {
        subtotalPaise: 10000,
        deliveryFeePaise: 1500,
        discountPaise: 1000,
        taxPaise: 500,
        grandTotalPaise: 11000,
      },
    })).toEqual({
      subtotal: 100,
      deliveryFee: 15,
      discountAmount: 10,
      taxAmount: 5,
      grandTotal: 110,
    });
  });

  test('preserves authoritative zero pricing after fulfillment repricing', () => {
    expect(normalizeOrderPricing({
      subtotal: 0,
      subtotalPaise: 0,
      deliveryFee: 10,
      deliveryFeePaise: 1000,
      discountAmount: 10,
      discountPaise: 1000,
      taxAmount: 0,
      taxPaise: 0,
      grandTotal: 0,
      grandTotalPaise: 0,
      totalAmount: 0,
      itemsSnapshot: {
        substitutions: [{ itemId: 'item-1', deltaPaise: -10000 }],
      },
      pricingSnapshot: {
        subtotalPaise: 10000,
        deliveryFeePaise: 1000,
        discountPaise: 1000,
        taxPaise: 0,
        grandTotalPaise: 10000,
      },
    })).toEqual({
      subtotal: 0,
      deliveryFee: 10,
      discountAmount: 10,
      taxAmount: 0,
      grandTotal: 0,
    });
  });

  test('prefers store-updated mutable totals over the checkout snapshot', () => {
    const items = [{ quantity: 2, price: 60 }];

    expect(normalizeOrderPricing({
      subtotal: 120,
      subtotalPaise: 12000,
      deliveryFee: 10,
      deliveryFeePaise: 1000,
      discountAmount: 5,
      discountPaise: 500,
      taxAmount: 0,
      taxPaise: 0,
      grandTotal: 125,
      grandTotalPaise: 12500,
      totalAmount: 125,
      pricingSnapshot: {
        subtotalPaise: 10000,
        deliveryFeePaise: 1000,
        discountPaise: 0,
        taxPaise: 0,
        grandTotalPaise: 11000,
      },
    }, items)).toEqual({
      subtotal: 120,
      deliveryFee: 10,
      discountAmount: 5,
      taxAmount: 0,
      grandTotal: 125,
    });
  });
});
