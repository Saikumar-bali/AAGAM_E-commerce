import type {
  DeliveryFailureReason,
  DeliveryOperationsSummary,
} from '../api/deliveryOperationsService';
import type { RiderDeliveryJob } from './riderWorkspace';

export type RiderDeliveryFlowView =
  | 'PROGRESS'
  | 'ARRIVED'
  | 'VERIFY'
  | 'ISSUE'
  | 'COMPLETE'
  | 'LEGACY';

export type RiderCompletionReceipt = {
  orderId: string;
  itemCount: number;
  paymentMethod: string;
  orderAmount: number;
  customerPaid: number | null;
  earnings: number | null;
  baseFare: number | null;
  distanceIncentive: number | null;
  surgeOther: number | null;
};

export const RIDER_FAILURE_CHOICES: Array<{
  label: string;
  value: DeliveryFailureReason;
}> = [
  { label: 'Customer not available', value: 'CUSTOMER_UNREACHABLE' },
  { label: 'Wrong / Incomplete address', value: 'WRONG_ADDRESS' },
  { label: 'Customer unreachable', value: 'CUSTOMER_UNREACHABLE' },
  { label: 'Customer refused to accept', value: 'CUSTOMER_REFUSED' },
  { label: 'Payment issue', value: 'PAYMENT_NOT_AVAILABLE' },
  { label: 'Other (Please specify)', value: 'OTHER' },
];

export function deliveryFlowViewForStatus(
  status?: string | null,
  override?: Exclude<RiderDeliveryFlowView, 'LEGACY'> | null,
): RiderDeliveryFlowView {
  if (override) return override;
  if (status === 'OUT_FOR_DELIVERY') return 'PROGRESS';
  if (status === 'RIDER_AT_CUSTOMER') return 'ARRIVED';
  if (status === 'DELIVERED') return 'COMPLETE';
  return 'LEGACY';
}

function finiteNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

export function buildRiderCompletionReceipt(
  job: RiderDeliveryJob,
  summary?: DeliveryOperationsSummary | null,
): RiderCompletionReceipt {
  const order = summary?.job?.order || job.order;
  const payout = finiteNumber(
    summary?.job?.riderPayoutAmount,
    summary?.job?.payoutAmount,
    job.riderPayoutAmount,
  );
  const breakdown = summary?.job?.riderPayoutBreakdown || summary?.job?.payoutBreakdown || {};
  const orderAmount = finiteNumber(order?.grandTotal) || 0;
  const codAmount = Number(summary?.cod?.expectedAmountPaise || 0) / 100;

  return {
    orderId: order?.id || job.orderId,
    itemCount: Array.isArray(order?.items)
      ? order.items.reduce((total: number, item: any) => total + Number(item?.quantity || 0), 0)
      : 0,
    paymentMethod: summary?.cod?.applicable ? 'COD' : 'Prepaid',
    orderAmount,
    customerPaid: summary?.cod?.applicable
      ? (summary.cod.collected ? codAmount || orderAmount : null)
      : orderAmount,
    earnings: payout,
    baseFare: finiteNumber(breakdown.baseFare, breakdown.base, breakdown.baseAmount),
    distanceIncentive: finiteNumber(
      breakdown.distanceIncentive,
      breakdown.distance,
      breakdown.distanceAmount,
    ),
    surgeOther: finiteNumber(
      breakdown.surgeOther,
      breakdown.surge,
      breakdown.other,
      breakdown.incentive,
    ),
  };
}

export function formatRiderAddress(snapshot?: Record<string, any> | null) {
  if (!snapshot) return 'Delivery address unavailable';
  return [snapshot.line1, snapshot.line2, snapshot.landmark, snapshot.city, snapshot.state, snapshot.pincode]
    .filter(Boolean)
    .join(', ');
}

export function formatRupees(value: number | null) {
  if (value == null) return '—';
  return `₹${value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function shortRiderOrderId(value?: string | null) {
  return value ? value.slice(-8).toUpperCase() : 'UNKNOWN';
}
