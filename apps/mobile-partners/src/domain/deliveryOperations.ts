import type {
  DeliveryFailureReason,
  DeliveryOperationsSummary,
  ReturnInspectionLine,
} from '../api/deliveryOperationsService';

export const DELIVERY_FAILURE_OPTIONS: Array<{
  value: DeliveryFailureReason;
  label: string;
}> = [
  { value: 'CUSTOMER_UNAVAILABLE', label: 'Customer unavailable' },
  { value: 'INVALID_ADDRESS', label: 'Invalid address' },
  { value: 'CUSTOMER_REFUSED', label: 'Customer refused' },
  { value: 'PAYMENT_ISSUE', label: 'Payment issue' },
  { value: 'UNSAFE_LOCATION', label: 'Unsafe location' },
  { value: 'OTHER', label: 'Other' },
];

const FAILURE_ALLOWED = new Set([
  'RIDER_EN_ROUTE_TO_STORE',
  'RIDER_AT_STORE',
  'OUT_FOR_DELIVERY',
  'RIDER_AT_CUSTOMER',
]);

export function riderOperationPolicy(summary?: DeliveryOperationsSummary | null) {
  const status = summary?.job?.status || null;
  const atCustomer = status === 'RIDER_AT_CUSTOMER';
  const codApplicable = Boolean(summary?.cod?.applicable);
  const codCollected = Boolean(summary?.cod?.collected);

  return {
    issueOtp: atCustomer,
    collectCod: codApplicable
      && !codCollected
      && (status === 'OUT_FOR_DELIVERY' || atCustomer),
    completeDelivery: atCustomer
      && (!summary?.requirements?.codCollectionRequired || !codApplicable || codCollected),
    recordFailure: Boolean(status && FAILURE_ALLOWED.has(status)),
    startReturn: status === 'DELIVERY_FAILED',
    waitingForStoreReturn: status === 'RETURNING_TO_STORE',
    terminal: status === 'DELIVERED' || status === 'RETURNED_TO_STORE' || status === 'CANCELLED',
  };
}

export function operationCompleted(summary: DeliveryOperationsSummary | null | undefined, type: string) {
  return Boolean(summary?.operations?.some((operation) => (
    operation.type === type && operation.status === 'COMPLETED'
  )));
}

export function buildInspectionLines(
  orderItems: Array<{ id: string; quantity: number }>,
  quantities: Record<string, { sellable: string; damaged: string; missing: string }>,
): ReturnInspectionLine[] {
  const lines: ReturnInspectionLine[] = [];
  for (const item of orderItems) {
    const values = quantities[item.id] || { sellable: '', damaged: '', missing: '' };
    const entries = [
      ['SELLABLE', Number(values.sellable || 0)],
      ['DAMAGED', Number(values.damaged || 0)],
      ['MISSING', Number(values.missing || 0)],
    ] as const;
    const total = entries.reduce((sum, [, quantity]) => sum + quantity, 0);
    if (!entries.every(([, quantity]) => Number.isInteger(quantity) && quantity >= 0)) {
      throw new Error('Inspection quantities must be whole numbers');
    }
    if (total !== item.quantity) {
      throw new Error(`Inspection must account for all ${item.quantity} unit(s)`);
    }
    entries.forEach(([disposition, quantity]) => {
      if (quantity > 0) lines.push({ orderItemId: item.id, disposition, quantity });
    });
  }
  return lines;
}
