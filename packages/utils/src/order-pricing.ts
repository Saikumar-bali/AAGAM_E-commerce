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

  // Historical orders store pricing snapshots in paise-only fields. Ignore stale zero
  // totals when item lines contain a real amount, then fall back through all formats.
  const subtotal = Math.max(
    0,
    firstPositive(
      finiteNumber(snapshot.subtotal),
      paiseToRupees(snapshot.subtotalPaise),
      finiteNumber(order?.subtotal),
      paiseToRupees(order?.subtotalPaise),
      itemSubtotal,
    ) ?? 0,
  );

  const deliveryFee = Math.max(
    0,
    firstDefined(
      finiteNumber(snapshot.deliveryFee),
      paiseToRupees(snapshot.deliveryFeePaise),
      finiteNumber(order?.deliveryFee),
      paiseToRupees(order?.deliveryFeePaise),
    ) ?? 0,
  );
  const discountAmount = Math.max(
    0,
    firstDefined(
      finiteNumber(snapshot.discountAmount),
      paiseToRupees(snapshot.discountPaise),
      finiteNumber(order?.discountAmount),
      paiseToRupees(order?.discountPaise),
    ) ?? 0,
  );
  const taxAmount = Math.max(
    0,
    firstDefined(
      finiteNumber(snapshot.taxAmount),
      paiseToRupees(snapshot.taxPaise),
      finiteNumber(order?.taxAmount),
      paiseToRupees(order?.taxPaise),
    ) ?? 0,
  );
  const calculatedGrandTotal = Math.max(0, subtotal + deliveryFee + taxAmount - discountAmount);
  const grandTotal = Math.max(
    0,
    firstPositive(
      finiteNumber(snapshot.grandTotal),
      paiseToRupees(snapshot.grandTotalPaise),
      finiteNumber(order?.grandTotal),
      paiseToRupees(order?.grandTotalPaise),
      finiteNumber(order?.totalAmount),
      calculatedGrandTotal,
    ) ?? 0,
  );

  return { subtotal, deliveryFee, discountAmount, taxAmount, grandTotal };
}
