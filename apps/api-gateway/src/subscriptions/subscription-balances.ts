/**
 * Single source of truth for subscription money.
 *
 * A subscription's balance lives in two places that can disagree:
 *  - `CustomerSubscription.amountCollectedPaise` / `amountDuePaise` (the ledger)
 *  - the per-delivery `SubscriptionDelivery.cashCollectedPaise` (the day cells)
 *
 * Most write paths keep both in step, but absolute writers
 * (`createManualSubscription`, `renewSubscription`, `updateManualSubscription`)
 * and partial ledger updates can leave the ledger short of the cash actually
 * recorded on deliveries. When that happens the store's Subscribers tab and the
 * 31-Day Matrix render different "Paid" figures for the same subscription.
 *
 * Reconciling through this helper keeps every reader on the same number: the
 * ledger is treated as a floor, and any cash evidenced on deliveries that the
 * ledger has not yet absorbed is recognised as collected and removed from due.
 */

export interface SubscriptionBalance {
  amountCollectedPaise?: number | null;
  amountDuePaise?: number | null;
}

export interface DeliveryCash {
  cashCollectedPaise?: number | null;
}

export interface ReconciledBalance {
  /** Collected amount after absorbing day-cell cash the ledger was missing. */
  amountCollectedPaise: number;
  /** Due amount reduced by the absorbed drift, never below zero. */
  amountDuePaise: number;
  /** Total cash recorded on the deliveries passed in. */
  deliveryCashPaise: number;
  /** Cash evidenced on deliveries but absent from the ledger. */
  driftPaise: number;
}

export function sumDeliveryCash(deliveries: readonly DeliveryCash[] | null | undefined): number {
  if (!deliveries?.length) return 0;
  return deliveries.reduce((sum, delivery) => sum + Math.max(0, delivery.cashCollectedPaise || 0), 0);
}

export function reconcileSubscriptionBalance(
  subscription: SubscriptionBalance,
  deliveries: readonly DeliveryCash[] | null | undefined,
): ReconciledBalance {
  const storedCollected = Math.max(0, subscription.amountCollectedPaise || 0);
  const storedDue = Math.max(0, subscription.amountDuePaise || 0);
  const deliveryCashPaise = sumDeliveryCash(deliveries);

  const amountCollectedPaise = Math.max(storedCollected, deliveryCashPaise);
  const driftPaise = amountCollectedPaise - storedCollected;
  const amountDuePaise = Math.max(0, storedDue - driftPaise);

  return { amountCollectedPaise, amountDuePaise, deliveryCashPaise, driftPaise };
}
