import type {
  RiderAssignmentOffer,
  RiderDeliveryJob,
  RiderWorkspace,
} from './riderWorkspace';

export type RiderPortalAlert = {
  id: string;
  title: string;
  body: string;
  deepLink?: string | null;
  deliveryJobId?: string | null;
  createdAt: string;
};

export type RiderPortalHome = {
  rider: RiderWorkspace['rider'];
  pendingOffers: number;
  activeJob: RiderDeliveryJob | null;
  completedToday: number;
  currentBreak?: { id: string; reason?: string | null; startedAt?: string } | null;
  unreadCount: number;
  alerts: RiderPortalAlert[];
};

export type RiderPortalOffer = RiderAssignmentOffer;
export type RiderPortalDelivery = (RiderDeliveryJob & { operations?: unknown[] }) | null;

export const RIDER_PORTAL_HOME_QUERY_KEY = ['rider', 'portal', 'home'] as const;
export const RIDER_PORTAL_OFFERS_QUERY_KEY = ['rider', 'portal', 'offers'] as const;
export const RIDER_PORTAL_DELIVERY_QUERY_KEY = ['rider', 'portal', 'delivery'] as const;
export const RIDER_PORTAL_HISTORY_QUERY_KEY = ['rider', 'portal', 'history'] as const;

function historyAssignment(job: RiderDeliveryJob): RiderAssignmentOffer {
  return {
    id: `portal-history:${job.id}`,
    deliveryJobId: job.id,
    status: 'ACCEPTED',
    offeredAt: job.createdAt || null,
    respondedAt: job.createdAt || null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    deliveryJob: job,
  };
}

export function normalizeRiderPortalWorkspace(input: {
  home: RiderPortalHome;
  offers: RiderPortalOffer[];
  delivery: RiderPortalDelivery;
  history?: RiderDeliveryJob[];
}): RiderWorkspace {
  return {
    rider: input.home?.rider || null,
    pendingOffers: Array.isArray(input.offers) ? input.offers : [],
    activeJob: input.delivery || input.home?.activeJob || null,
    assignmentHistory: Array.isArray(input.history)
      ? input.history.map(historyAssignment)
      : [],
  };
}

export function shouldUseLegacyRiderWorkspace(error: any) {
  const status = Number(error?.response?.status || 0);
  return status === 404 || status === 405 || status === 501;
}
