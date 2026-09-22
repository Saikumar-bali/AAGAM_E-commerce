import { reconcileSubscriptionBalance, sumDeliveryCash } from './subscription-balances';

describe('sumDeliveryCash', () => {
  it('totals cash recorded across deliveries', () => {
    expect(sumDeliveryCash([{ cashCollectedPaise: 13000 }, { cashCollectedPaise: 5000 }, { cashCollectedPaise: 0 }])).toBe(18000);
  });

  it('tolerates null, undefined and negative values', () => {
    expect(sumDeliveryCash(null)).toBe(0);
    expect(sumDeliveryCash(undefined)).toBe(0);
    expect(sumDeliveryCash([])).toBe(0);
    expect(sumDeliveryCash([{ cashCollectedPaise: null }, { cashCollectedPaise: -100 }, {}])).toBe(0);
  });
});

describe('reconcileSubscriptionBalance', () => {
  it('leaves a consistent subscription untouched', () => {
    expect(
      reconcileSubscriptionBalance(
        { amountCollectedPaise: 13000, amountDuePaise: 46900 },
        [{ cashCollectedPaise: 13000 }],
      ),
    ).toEqual({
      amountCollectedPaise: 13000,
      amountDuePaise: 46900,
      deliveryCashPaise: 13000,
      driftPaise: 0,
    });
  });

  // Regression: Nookalamma's subscription stored a ₹50 ledger against a ₹130
  // day cell, so the 31-Day Matrix showed Paid ₹50 while the cell showed ₹130.
  it('absorbs day-cell cash the ledger never recorded', () => {
    expect(
      reconcileSubscriptionBalance(
        { amountCollectedPaise: 5000, amountDuePaise: 46900 },
        [{ cashCollectedPaise: 13000 }],
      ),
    ).toEqual({
      amountCollectedPaise: 13000,
      amountDuePaise: 38900,
      deliveryCashPaise: 13000,
      driftPaise: 8000,
    });
  });

  it('sums cash across merged subscriptions in the same row', () => {
    const reconciled = reconcileSubscriptionBalance(
      { amountCollectedPaise: 5000, amountDuePaise: 38900 },
      [{ cashCollectedPaise: 13000 }, { cashCollectedPaise: 20000 }],
    );
    expect(reconciled.amountCollectedPaise).toBe(33000);
    expect(reconciled.amountDuePaise).toBe(10900);
    expect(reconciled.driftPaise).toBe(28000);
  });

  it('never drives due below zero', () => {
    const reconciled = reconcileSubscriptionBalance(
      { amountCollectedPaise: 0, amountDuePaise: 1000 },
      [{ cashCollectedPaise: 25000 }],
    );
    expect(reconciled.amountDuePaise).toBe(0);
    expect(reconciled.amountCollectedPaise).toBe(25000);
  });

  it('keeps the ledger when it is ahead of the day cells', () => {
    const reconciled = reconcileSubscriptionBalance(
      { amountCollectedPaise: 20000, amountDuePaise: 10000 },
      [{ cashCollectedPaise: 5000 }],
    );
    expect(reconciled.amountCollectedPaise).toBe(20000);
    expect(reconciled.amountDuePaise).toBe(10000);
    expect(reconciled.driftPaise).toBe(0);
  });

  it('handles a subscription with no deliveries and no balance fields', () => {
    expect(reconcileSubscriptionBalance({}, [])).toEqual({
      amountCollectedPaise: 0,
      amountDuePaise: 0,
      deliveryCashPaise: 0,
      driftPaise: 0,
    });
  });
});
