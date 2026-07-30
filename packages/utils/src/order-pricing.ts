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
  const itemSubtotal = items.reduce((sum, item) => sum + normalizeOrderLine(item).lineTotal, 0);

  // Store fulfillment can mutate the persisted order totals after checkout (for
  // example, following an item substitution). Prefer those current values over
  // the immutable checkout snapshot, while retaining snapshot and item fallbacks
  // for historical rows that do not have usable persisted totals.
  const subtotal = Math.max(
    0,
    firstPositive(
      finiteNumber(order?.subtotal),
      paiseToRupees(order?.subtotalPaise),
      finiteNumber(snapshot.subtotal),
      paiseToRupees(snapshot.subtotalPaise),
      itemSubtotal,
    ) ?? 0,
  );

  const deliveryFee = Math.max(
    0,
    firstDefined(
      finiteNumber(order?.deliveryFee),
      paiseToRupees(order?.deliveryFeePaise),
      finiteNumber(snapshot.deliveryFee),
      paiseToRupees(snapshot.deliveryFeePaise),
    ) ?? 0,
  );
  const discountAmount = Math.max(
    0,
    firstDefined(
      finiteNumber(order?.discountAmount),
      paiseToRupees(order?.discountPaise),
      finiteNumber(snapshot.discountAmount),
      paiseToRupees(snapshot.discountPaise),
    ) ?? 0,
  );
  const taxAmount = Math.max(
    0,
    firstDefined(
      finiteNumber(order?.taxAmount),
      paiseToRupees(order?.taxPaise),
      finiteNumber(snapshot.taxAmount),
      paiseToRupees(snapshot.taxPaise),
    ) ?? 0,
  );
  const calculatedGrandTotal = Math.max(0, subtotal + deliveryFee + taxAmount - discountAmount);
  const grandTotal = Math.max(
    0,
    firstPositive(
      finiteNumber(order?.grandTotal),
      paiseToRupees(order?.grandTotalPaise),
      finiteNumber(order?.totalAmount),
      finiteNumber(snapshot.grandTotal),
      paiseToRupees(snapshot.grandTotalPaise),
      calculatedGrandTotal,
    ) ?? 0,
  );

  return { subtotal, deliveryFee, discountAmount, taxAmount, grandTotal };
}
