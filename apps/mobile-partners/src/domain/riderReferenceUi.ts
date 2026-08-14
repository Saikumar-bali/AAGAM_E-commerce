import type { PartnerNotification } from '../api/notificationService';
import type {
  RiderAssignmentOffer,
  RiderDeliveryJob,
  RiderOrder,
  RiderWorkspace,
} from './riderWorkspace';

export type RiderJobVisualStatus =
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'PENDING'
  | 'CANCELLED'
  | 'RETURNED';

export type RiderJobListItem = {
  key: string;
  orderId: string;
  status: RiderJobVisualStatus;
  time: string | null;
  pickupName: string;
  pickupAddress: string;
  deliveryAddress: string;
  distanceKm: number | null;
  job: RiderDeliveryJob | null;
  offer: RiderAssignmentOffer | null;
  payout: number | null;
  deliveryWindowStart?: string | null;
  deliveryWindowEnd?: string | null;
};

export type RiderWeekSummary = {
  total: number | null;
  completed: number;
  average: number | null;
  daily: Array<{ date: Date; amount: number }>;
  payouts: number | null;
  incentives: number;
  adjustments: number;
};

const validDate = (value?: string | null) => {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

export const startOfLocalDay = (value: Date) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

export const startOfLocalWeek = (value: Date) => {
  const date = startOfLocalDay(value);
  date.setDate(date.getDate() - date.getDay());
  return date;
};

export function sameLocalDay(timestamp: number | null, day: Date) {
  if (timestamp == null) return false;
  const start = startOfLocalDay(day).getTime();
  return timestamp >= start && timestamp < start + 24 * 60 * 60 * 1000;
}

export function shortPartnerOrderId(value?: string | null) {
  return value ? value.slice(-8).toUpperCase() : 'UNKNOWN';
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function compactAddress(snapshot?: Record<string, unknown> | null) {
  if (!snapshot) return 'Address unavailable';
  const parts = [
    snapshot.line1,
    snapshot.line2,
    snapshot.landmark,
    snapshot.city,
    snapshot.state,
    snapshot.pincode,
  ].map(stringValue).filter((value): value is string => Boolean(value));
  return parts.join(', ') || 'Address unavailable';
}

function orderPickupAddress(order: RiderOrder) {
  return order.store?.address || 'Pickup address unavailable';
}

function orderDeliveryAddress(order: RiderOrder) {
  return compactAddress(order.addressSnapshot as Record<string, unknown> | null | undefined);
}

function payoutAmount(assignment?: RiderAssignmentOffer | null, job?: RiderDeliveryJob | null) {
  const values = [
    assignment?.riderPayoutAmount,
    assignment?.payoutAmount,
    job?.riderPayoutAmount,
  ];
  const value = values.find((candidate) => typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0);
  return value == null ? null : value;
}

function assignmentTimestamp(assignment: RiderAssignmentOffer) {
  return validDate(
    assignment.deliveryJob.order.deliveredAt
      || assignment.deliveryJob.completedAt
      || assignment.respondedAt
      || assignment.updatedAt
      || assignment.offeredAt
      || assignment.createdAt,
  );
}

function jobTimestamp(job: RiderDeliveryJob) {
  return validDate(job.completedAt || job.updatedAt || job.createdAt);
}

export function visualStatusForJob(job: RiderDeliveryJob): RiderJobVisualStatus {
  if (job.status === 'DELIVERED') return 'COMPLETED';
  if (job.status === 'RETURNED_TO_STORE' || job.status === 'RETURNING_TO_STORE') return 'RETURNED';
  if (job.status === 'CANCELLED' || job.status === 'DELIVERY_FAILED') return 'CANCELLED';
  if (job.status === 'RIDER_ASSIGNED' || job.status === 'WAITING_FOR_DISPATCH') return 'ASSIGNED';
  return 'IN_PROGRESS';
}

export function visualStatusForAssignment(assignment: RiderAssignmentOffer): RiderJobVisualStatus {
  if (assignment.deliveryJob.status === 'DELIVERED') return 'COMPLETED';
  if (assignment.deliveryJob.status === 'RETURNED_TO_STORE' || assignment.deliveryJob.status === 'RETURNING_TO_STORE') return 'RETURNED';
  if (assignment.status === 'REJECTED' || assignment.status === 'CANCELLED' || assignment.deliveryJob.status === 'CANCELLED') return 'CANCELLED';
  if (assignment.status === 'EXPIRED') return 'PENDING';
  if (assignment.status === 'OFFERED' || assignment.status === 'CREATED') return 'ASSIGNED';
  return visualStatusForJob(assignment.deliveryJob);
}

function toRadians(value: number) {
  return value * Math.PI / 180;
}

export function routeDistanceKm(order: RiderOrder) {
  const fromLat = order.store?.latitude;
  const fromLng = order.store?.longitude;
  const toLat = order.deliveryLat;
  const toLng = order.deliveryLng;
  if (![fromLat, fromLng, toLat, toLng].every((value) => typeof value === 'number' && Number.isFinite(value))) {
    return null;
  }
  const earthRadiusKm = 6371;
  const latDiff = toRadians((toLat as number) - (fromLat as number));
  const lngDiff = toRadians((toLng as number) - (fromLng as number));
  const a = Math.sin(latDiff / 2) ** 2
    + Math.cos(toRadians(fromLat as number))
    * Math.cos(toRadians(toLat as number))
    * Math.sin(lngDiff / 2) ** 2;
  return Math.round((earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))) * 10) / 10;
}

function listItemFromJob(job: RiderDeliveryJob): RiderJobListItem {
  return {
    key: `job:${job.id}`,
    orderId: job.order.id || job.orderId,
    status: visualStatusForJob(job),
    time: job.updatedAt || job.createdAt || null,
    pickupName: job.order.store?.name || 'Aagaam Store',
    pickupAddress: orderPickupAddress(job.order),
    deliveryAddress: orderDeliveryAddress(job.order),
    distanceKm: routeDistanceKm(job.order),
    job,
    offer: null,
    payout: payoutAmount(null, job),
    deliveryWindowStart: job.order.deliveryWindowStart || null,
    deliveryWindowEnd: job.order.deliveryWindowEnd || null,
  };
}

function listItemFromAssignment(assignment: RiderAssignmentOffer): RiderJobListItem {
  const job = assignment.deliveryJob;
  return {
    key: `assignment:${assignment.id}`,
    orderId: job.order.id || job.orderId,
    status: visualStatusForAssignment(assignment),
    time: assignment.respondedAt || assignment.offeredAt || assignment.createdAt || job.updatedAt || null,
    pickupName: job.order.store?.name || 'Aagaam Store',
    pickupAddress: orderPickupAddress(job.order),
    deliveryAddress: orderDeliveryAddress(job.order),
    distanceKm: routeDistanceKm(job.order),
    job,
    offer: assignment,
    payout: payoutAmount(assignment, job),
    deliveryWindowStart: job.order.deliveryWindowStart || null,
    deliveryWindowEnd: job.order.deliveryWindowEnd || null,
  };
}

export function buildTodayJobList(workspace?: RiderWorkspace | null, now = new Date()) {
  if (!workspace) return [] as RiderJobListItem[];
  const result: RiderJobListItem[] = [];
  const seenOrders = new Set<string>();
  const add = (item: RiderJobListItem) => {
    if (seenOrders.has(item.orderId)) return;
    seenOrders.add(item.orderId);
    result.push(item);
  };

  if (workspace.activeJob) add(listItemFromJob(workspace.activeJob));
  workspace.pendingOffers.forEach((offer) => add(listItemFromAssignment(offer)));
  workspace.assignmentHistory
    .filter((assignment) => sameLocalDay(assignmentTimestamp(assignment), now))
    .forEach((assignment) => add(listItemFromAssignment(assignment)));

  return result.sort((left, right) => {
    const leftTime = validDate(left.time) || 0;
    const rightTime = validDate(right.time) || 0;
    return leftTime - rightTime;
  });
}

export function summarizeTodayJobs(items: RiderJobListItem[]) {
  return {
    assigned: items.length,
    completed: items.filter((item) => item.status === 'COMPLETED').length,
    inProgress: items.filter((item) => item.status === 'IN_PROGRESS').length,
    pending: items.filter((item) => item.status === 'ASSIGNED' || item.status === 'PENDING').length,
  };
}

export function historyItems(workspace?: RiderWorkspace | null) {
  return (workspace?.assignmentHistory || [])
    .filter((assignment) => !['CREATED', 'OFFERED'].includes(assignment.status))
    .map(listItemFromAssignment)
    .sort((left, right) => (validDate(right.time) || 0) - (validDate(left.time) || 0));
}

export type NotificationSection = 'TODAY' | 'YESTERDAY' | 'OLDER';

export function notificationSection(createdAt: string, now = new Date()): NotificationSection {
  const timestamp = validDate(createdAt);
  if (sameLocalDay(timestamp, now)) return 'TODAY';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameLocalDay(timestamp, yesterday)) return 'YESTERDAY';
  return 'OLDER';
}

export function isNotificationUpdate(item: PartnerNotification) {
  const type = String(item.type || item.metadata?.eventType || '').toUpperCase();
  return type.includes('UPDATE')
    || type.includes('DELAY')
    || type.includes('INCENTIVE')
    || type.includes('DEMAND')
    || type.includes('MAINTENANCE')
    || type.includes('SYSTEM');
}

function breakdownValue(assignment: RiderAssignmentOffer, names: string[]) {
  const assignmentValue = assignment as any;
  const jobValue = assignment.deliveryJob as any;
  const breakdown = assignmentValue.payoutBreakdown
    || assignmentValue.riderPayoutBreakdown
    || jobValue.payoutBreakdown
    || jobValue.riderPayoutBreakdown
    || {};
  for (const name of names) {
    const value = breakdown[name];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return 0;
}

export function summarizeRiderWeek(history: RiderAssignmentOffer[], now = new Date()): RiderWeekSummary {
  const weekStart = startOfLocalWeek(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const daily = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    return { date, amount: 0 };
  });
  const completed = history.filter((assignment) => {
    const timestamp = assignmentTimestamp(assignment);
    return assignment.status === 'ACCEPTED'
      && assignment.deliveryJob.status === 'DELIVERED'
      && timestamp != null
      && timestamp >= weekStart.getTime()
      && timestamp < weekEnd.getTime();
  });
  const payouts = completed.map((assignment) => payoutAmount(assignment, assignment.deliveryJob));
  const total = completed.length === 0
    ? 0
    : payouts.every((value): value is number => value != null)
      ? payouts.reduce((sum, value) => sum + value, 0)
      : null;
  completed.forEach((assignment) => {
    const timestamp = assignmentTimestamp(assignment);
    const payout = payoutAmount(assignment, assignment.deliveryJob);
    if (timestamp == null || payout == null) return;
    const index = new Date(timestamp).getDay();
    daily[index].amount += payout;
  });
  const incentives = completed.reduce((sum, assignment) => sum + breakdownValue(
    assignment,
    ['distanceIncentive', 'surgeOther', 'surge', 'incentive', 'bonus'],
  ), 0);
  const adjustments = completed.reduce((sum, assignment) => sum + breakdownValue(
    assignment,
    ['adjustment', 'adjustments'],
  ), 0);
  return {
    total,
    completed: completed.length,
    average: total == null || completed.length === 0 ? null : total / completed.length,
    daily,
    payouts: total == null ? null : Math.max(0, total - incentives - adjustments),
    incentives,
    adjustments,
  };
}

export function weekRangeLabel(now = new Date()) {
  const start = startOfLocalWeek(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const startLabel = start.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  const endLabel = end.toLocaleDateString('en-IN', {
    month: sameMonth ? undefined : 'short',
    day: 'numeric',
  });
  return `${startLabel} – ${endLabel}`;
}
