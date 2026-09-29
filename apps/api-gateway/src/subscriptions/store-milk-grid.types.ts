/**
 * Shared types for the store milk grid.
 *
 * Split out of the former store-milk-grid.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */

export interface GridCell {
  deliveryId: string;
  sequenceNumber: number;
  status: string;
  deliverySlot: string;
  baseQuantity: string;
  extraMilk: string | null;
  cashCollectedPaise: number;
  cashDuePaise: number;
  paymentMode: 'CASH' | 'PHONE_PE' | 'DUE' | null;
  note: string | null;
  /** Plan label when this delivery's plan differs from the row's primary plan. */
  planLabel: string | null;
  assignedRider?: {
    id: string;
    name: string;
    phone: string;
  } | null;
  photoProof?: {
    storageKey: string;
    capturedAt: string;
    gpsLat: number | null;
    gpsLng: number | null;
    accuracyMetres: number | null;
    riderName?: string;
  } | null;
}

export interface PlanInfo {
  name: string;
  dailyQuantity: string;
  dayRange: string;
}

export interface GridRow {
  subscriptionId: string;
  customer: {
    id: string;
    name: string;
    phone: string;
    address: string;
    customerType: 'online' | 'offline';
  };
  plan: {
    id: string;
    name: string;
    code: string;
    dailyQuantity: string;
  };
  slot: string;
  defaultRider?: {
    id: string;
    name: string;
    phone?: string;
  } | null;
  temporaryRider?: {
    id: string;
    name: string;
    phone?: string;
    startDate?: string | null;
    endDate?: string | null;
  } | null;
  /** All distinct plans this customer had deliveries for in this month. */
  allPlans: PlanInfo[];
  days: Record<number, GridCell | null>;
  totalDeliveredDays: number;
  totalExtraLiters: number;
  totalLiters: number;
  totalCollectedPaise: number;
  totalDuePaise: number;
}
