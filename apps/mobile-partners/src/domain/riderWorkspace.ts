export type DeliveryJobStatus =
  | 'WAITING_FOR_DISPATCH'
  | 'RIDER_ASSIGNED'
  | 'RIDER_EN_ROUTE_TO_STORE'
  | 'RIDER_AT_STORE'
  | 'PICKUP_VERIFIED'
  | 'OUT_FOR_DELIVERY'
  | 'RIDER_AT_CUSTOMER'
  | 'DELIVERED'
  | 'DELIVERY_FAILED'
  | 'RETURNING_TO_STORE'
  | 'RETURNED_TO_STORE'
  | 'CANCELLED';

export type DispatchAssignmentStatus =
  | 'CREATED'
  | 'OFFERED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'REASSIGNED';

export type RiderOrder = {
  id: string;
  status?: string;
  grandTotal?: number;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  addressSnapshot?: Record<string, any> | null;
  customer?: { id?: string; name?: string | null; phone?: string | null } | null;
  store?: {
    id?: string;
    name?: string | null;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  items?: Array<{
    id?: string;
    quantity?: number;
    product?: { id?: string; name?: string | null; image?: string | null } | null;
  }>;
};

export type RiderDeliveryJob = {
  id: string;
  orderId: string;
  status: DeliveryJobStatus;
  currentRiderId?: string | null;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
  order: RiderOrder;
};

export type RiderAssignmentOffer = {
  id: string;
  deliveryJobId: string;
  status: DispatchAssignmentStatus;
  offeredAt?: string | null;
  respondedAt?: string | null;
  expiresAt?: string | null;
  rejectionReason?: string | null;
  createdAt?: string;
  updatedAt?: string;
  deliveryJob: RiderDeliveryJob;
};

export type RiderWorkspace = {
  rider: {
    id: string;
    status: 'ONLINE' | 'OFFLINE' | 'BUSY';
    latitude?: number | null;
    longitude?: number | null;
    user?: { id?: string; name?: string | null; phone?: string | null } | null;
  } | null;
  pendingOffers: RiderAssignmentOffer[];
  activeJob: RiderDeliveryJob | null;
  assignmentHistory: RiderAssignmentOffer[];
};

// DELIVERED remains in the transport type for compatibility with older callers,
// but it is intentionally absent from ACTIONS below. The Partners UI can no
// longer expose generic completion; Phase 3 operations enforce OTP/COD gates.
export type RiderJobAction =
  | 'EN_ROUTE_TO_STORE'
  | 'ARRIVED_AT_STORE'
  | 'OUT_FOR_DELIVERY'
  | 'ARRIVED_AT_CUSTOMER'
  | 'DELIVERED';

export type RiderActionDescriptor = {
  action: RiderJobAction;
  label: string;
  confirmation: string;
};

const ACTIONS: Partial<Record<DeliveryJobStatus, RiderActionDescriptor>> = {
  RIDER_ASSIGNED: {
    action: 'EN_ROUTE_TO_STORE',
    label: 'Start trip to store',
    confirmation: 'Confirm that you are leaving for the pickup store.',
  },
  RIDER_EN_ROUTE_TO_STORE: {
    action: 'ARRIVED_AT_STORE',
    label: 'I arrived at the store',
    confirmation: 'Confirm that you have reached the pickup store.',
  },
  PICKUP_VERIFIED: {
    action: 'OUT_FOR_DELIVERY',
    label: 'Start customer delivery',
    confirmation: 'Confirm that the verified order is with you.',
  },
  OUT_FOR_DELIVERY: {
    action: 'ARRIVED_AT_CUSTOMER',
    label: 'I arrived at the customer',
    confirmation: 'Confirm that you reached the delivery address.',
  },
};

const TRACKABLE_STATUSES = new Set<DeliveryJobStatus>([
  'RIDER_ASSIGNED',
  'RIDER_EN_ROUTE_TO_STORE',
  'RIDER_AT_STORE',
  'PICKUP_VERIFIED',
  'OUT_FOR_DELIVERY',
  'RIDER_AT_CUSTOMER',
  'DELIVERY_FAILED',
  'RETURNING_TO_STORE',
]);

const TERMINAL_STATUSES = new Set<DeliveryJobStatus>([
  'DELIVERED',
  'RETURNED_TO_STORE',
  'CANCELLED',
]);

export function normalizeRiderWorkspace(input: unknown): RiderWorkspace {
  const value = input && typeof input === 'object' ? (input as any) : {};
  return {
    rider: value.rider || null,
    pendingOffers: Array.isArray(value.pendingOffers) ? value.pendingOffers : [],
    activeJob: value.activeJob || null,
    assignmentHistory: Array.isArray(value.assignmentHistory) ? value.assignmentHistory : [],
  };
}

export function offerSecondsRemaining(expiresAt?: string | null, nowMs = Date.now()) {
  if (!expiresAt) return null;
  const expiryMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiryMs)) return 0;
  return Math.max(0, Math.ceil((expiryMs - nowMs) / 1000));
}

export function isOfferActionable(offer: RiderAssignmentOffer, nowMs = Date.now()) {
  if (offer.status !== 'OFFERED') return false;
  const remaining = offerSecondsRemaining(offer.expiresAt, nowMs);
  return remaining === null || remaining > 0;
}

export function nextActionForStatus(status: DeliveryJobStatus) {
  return ACTIONS[status] || null;
}

export function isTrackableDeliveryStatus(status: DeliveryJobStatus) {
  return TRACKABLE_STATUSES.has(status);
}

export function isTerminalDeliveryStatus(status: DeliveryJobStatus) {
  return TERMINAL_STATUSES.has(status);
}

export function trackingIntervalForStatus(status: DeliveryJobStatus) {
  if (status === 'OUT_FOR_DELIVERY' || status === 'RIDER_AT_CUSTOMER') return 8_000;
  if (status === 'PICKUP_VERIFIED') return 12_000;
  return 20_000;
}

export function deliveryStatusLabel(status: DeliveryJobStatus) {
  return status
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}
