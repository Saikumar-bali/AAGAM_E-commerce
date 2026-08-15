import { customerOrderAmountSummary, formatOrderAmount } from './orderPresentation';
import { subscriptionSegmentCounts } from './subscriptionPresentation';

describe('customer subscription presentation', () => {
  it('shows the full cash obligation for a subscription order instead of occurrence accounting value', () => {
    const summary = customerOrderAmountSummary({
      orderSource: 'SUBSCRIPTION',
      grandTotal: 28.3,
      grandTotalPaise: 2830,
      payment: { amountPaise: 84900 },
      pricingSnapshot: {
        source: 'SUBSCRIPTION',
        occurrenceValuePaise: 2830,
        customerAmountDuePaise: 84900,
      },
    });

    expect(summary).toEqual({
      amountRupees: 849,
      label: 'Cash due',
      isSubscription: true,
    });
    expect(formatOrderAmount(summary.amountRupees)).toBe('₹849');
  });

  it('shows funded subscription deliveries as zero due even when the occurrence has accounting value', () => {
    expect(customerOrderAmountSummary({
      orderSource: 'SUBSCRIPTION',
      grandTotal: 28.3,
      grandTotalPaise: 2830,
      payment: { amountPaise: 0 },
      pricingSnapshot: {
        source: 'SUBSCRIPTION',
        customerAmountDuePaise: 0,
        funded: true,
      },
    })).toEqual({
      amountRupees: 0,
      label: 'Funded delivery',
      isSubscription: true,
    });
  });

  it('falls back to the immutable subscription pricing snapshot when payment is unavailable', () => {
    expect(customerOrderAmountSummary({
      pricingSnapshot: {
        source: 'SUBSCRIPTION',
        customerAmountDuePaise: 42000,
      },
      grandTotal: 14,
    }).amountRupees).toBe(420);
  });

  it('keeps normal order totals unchanged and prefers exact paise totals', () => {
    expect(customerOrderAmountSummary({
      orderSource: 'STANDARD',
      grandTotalPaise: 2830,
      grandTotal: 999,
    })).toEqual({
      amountRupees: 28.3,
      label: 'Order total',
      isSubscription: false,
    });
    expect(formatOrderAmount(28.3)).toBe('₹28.30');
  });

  it('counts each customer subscription status into the correct tab', () => {
    expect(subscriptionSegmentCounts([
      { status: 'ACTIVE' },
      { status: 'PAYMENT_DUE' },
      { status: 'PENDING_CASH_COLLECTION' },
      { status: 'PAUSED' },
      { status: 'COMPLETED' },
      { status: 'CANCELLED' },
    ])).toEqual({
      Active: 2,
      Upcoming: 1,
      Paused: 1,
      Completed: 2,
    });
  });
});
