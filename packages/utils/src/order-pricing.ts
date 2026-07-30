export type OrderPricingItem = {
  quantity?: unknown;
  price?: unknown;
  unitPrice?: unknown;
  lineTotal?: unknown;
  unitPricePaise?: unknown;
  lineTotalPaise?: unknown;
};

export type NormalizedOrderLine = {
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type NormalizedOrderPricing = {
  subtotal: number;
  deliveryFee: number;
  discountAmount: number;
  taxAmount: number;
  grandTotal: number;
};

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function paiseToRupees(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed === null ? null : parsed / 100;
}

function firstDefined(...values: Array<number | null>): number | null {
  return values.find((value) => value !== null) ?? null;
}

function firstPositive(...values: Array<number | null>): number | null {
  return values.find((value) => value !== null && value > 0) ?? null;
}

export function normalizeOrderLine(item: OrderPricingItem): NormalizedOrderLine {
  const quantity = Math.max(0, finiteNumber(item.quantity) ?? 0);
  const unitPrice = Math.max(
    0,
    firstDefined(finiteNumber(item.unitPrice), finiteNumber(item.price), paiseToRupees(item.unitPricePaise)) ?? 0,
  );
  const storedLineTotal = firstPositive(finiteNumber(item.lineTotal), paiseToRupees(item.lineTotalPaise));
  const calculatedLineTotal = quantity * unitPrice;

  return {
    quantity,
    unitPrice,
    lineTotal: storedLineTotal ?? calculatedLineTotal,
  };
}

export function normalizeOrderPricing(
  order: Record<string, any> | null | undefined,
  items: OrderPricingItem[] = [],
): NormalizedOrderPricing {
  const snapshot = order?.pricingSnapshot && typeof order.pricingSnapshot === 'object'
    ? order.pricingSnapshot
    : {};
  const fulfillmentSnapshot = order?.itemsSnapshot && typeof order.itemsSnapshot === 'object'
    ? order.itemsSnapshot
    : {};
  const itemSubtotal = items.reduce((sum, item) => sum + normalizeOrderLine(item).lineTotal, 0);
  const currentSubtotalValues = [
    finiteNumber(order?.subtotal),
    paiseToRupees(order?.subtotalPaise),
  ];
  const currentBreakdownValues = [
    ...currentSubtotalValues,
    finiteNumber(order?.deliveryFee),
    paiseToRupees(order?.deliveryFeePaise),
    finiteNumber(order?.discountAmount),
    paiseToRupees(order?.discountPaise),
    finiteNumber(order?.taxAmount),
    paiseToRupees(order?.taxPaise),
  ];
  const hasCurrentPricingEvidence = currentBreakdownValues.some((value) => value !== null && value !== 0)
    || (Array.isArray(fulfillmentSnapshot.substitutions) && fulfillmentSnapshot.substitutions.length > 0);

  // Store fulfillment can mutate the persisted order totals after checkout (for
  // example, following an item substitution). Prefer those current values over
  // the immutable checkout snapshot, while retaining snapshot and item fallbacks
  // for historical rows that do not have usable persisted totals. A zero subtotal
  // is authoritative when fulfillment metadata or another current pricing field
  // proves the mutable pricing record was recalculated.
  const positiveCurrentSubtotal = firstPositive(...currentSubtotalValues);
  const hasAuthoritativeCurrentSubtotalZero = hasCurrentPricingEvidence
    && currentSubtotalValues.some((value) => value === 0)
    && positiveCurrentSubtotal === null;
  const subtotal = Math.max(
    0,
    positiveCurrentSubtotal
      ?? (hasAuthoritativeCurrentSubtotalZero
        ? 0
        : firstPositive(
            finiteNumber(snapshot.subtotal),
            paiseToRupees(snapshot.subtotalPaise),
            itemSubtotal,
          ) ?? 0),
  );

  // Prisma-backed legacy rows may serialize newer money columns as zero even
  // though their checkout snapshot contains the authoritative historical value.
  // Skip those stale zero defaults, then fall back to zero only when no source
  // contains a positive fee, discount, or tax amount.
  const deliveryFee = Math.max(
    0,
    firstPositive(
      finiteNumber(order?.deliveryFee),
      paiseToRupees(order?.deliveryFeePaise),
      finiteNumber(snapshot.deliveryFee),
      paiseToRupees(snapshot.deliveryFeePaise),
    ) ?? 0,
  );
  const discountAmount = Math.max(
    0,
    firstPositive(
      finiteNumber(order?.discountAmount),
      paiseToRupees(order?.discountPaise),
      finiteNumber(snapshot.discountAmount),
      paiseToRupees(snapshot.discountPaise),
    ) ?? 0,
  );
  const taxAmount = Math.max(
    0,
    firstPositive(
      finiteNumber(order?.taxAmount),
      paiseToRupees(order?.taxPaise),
      finiteNumber(snapshot.taxAmount),
      paiseToRupees(snapshot.taxPaise),
    ) ?? 0,
  );
  const calculatedGrandTotal = Math.max(0, subtotal + deliveryFee + taxAmount - discountAmount);
  const currentGrandTotalValues = [
    finiteNumber(order?.grandTotal),
    paiseToRupees(order?.grandTotalPaise),
    finiteNumber(order?.totalAmount),
  ];
  const positiveCurrentGrandTotal = firstPositive(...currentGrandTotalValues);
  const hasAuthoritativeCurrentZero = hasCurrentPricingEvidence
    && currentGrandTotalValues.some((value) => value === 0)
    && positiveCurrentGrandTotal === null;
  const grandTotal = Math.max(
    0,
    positiveCurrentGrandTotal
      ?? (hasAuthoritativeCurrentZero
        ? 0
        : firstPositive(
            finiteNumber(snapshot.grandTotal),
            paiseToRupees(snapshot.grandTotalPaise),
            calculatedGrandTotal,
          ) ?? 0),
  );

  return { subtotal, deliveryFee, discountAmount, taxAmount, grandTotal };
}
