type OrderLike = Record<string, any> | null | undefined;

export type CustomerOrderAmountSummary = {
  amountRupees: number;
  label: 'Cash due' | 'Funded delivery' | 'Order total';
  isSubscription: boolean;
};

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstDefined(...values: Array<number | null>): number | null {
  return values.find((value) => value !== null) ?? null;
}

function jsonRecord(value: unknown): Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

export function customerOrderAmountSummary(order: OrderLike): CustomerOrderAmountSummary {
  const pricingSnapshot = jsonRecord(order?.pricingSnapshot);
  const isSubscription =
    String(order?.orderSource || '').toUpperCase() === 'SUBSCRIPTION'
    || String(pricingSnapshot.source || '').toUpperCase() === 'SUBSCRIPTION'
    || Boolean(order?.subscriptionId);

  if (isSubscription) {
    // A subscription Order's grand total is the accounting value of this single
    // occurrence (for example ₹28.30 of a ₹849 / 30-day plan). The amount the
    // customer must actually hand over is intentionally stored separately on
    // Payment and in the immutable pricing snapshot. Never present occurrence
    // value as though it were the cash obligation.
    const duePaise = Math.max(
      0,
      firstDefined(
        finiteNumber(order?.payment?.amountPaise),
        finiteNumber(pricingSnapshot.customerAmountDuePaise),
      ) ?? 0,
    );
    return {
      amountRupees: duePaise / 100,
      label: duePaise > 0 ? 'Cash due' : 'Funded delivery',
      isSubscription: true,
    };
  }

  const amountRupees = Math.max(
    0,
    firstDefined(
      finiteNumber(order?.grandTotalPaise) !== null
        ? Number(order?.grandTotalPaise) / 100
        : null,
      finiteNumber(order?.grandTotal),
      finiteNumber(order?.totalAmount),
    ) ?? 0,
  );

  return {
    amountRupees,
    label: 'Order total',
    isSubscription: false,
  };
}

export function formatOrderAmount(amountRupees: number) {
  return `₹${Number(amountRupees || 0).toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(amountRupees) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
