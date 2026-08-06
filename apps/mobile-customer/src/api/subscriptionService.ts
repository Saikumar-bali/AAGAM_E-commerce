import { apiClient } from './client';

export type SubscriptionDeliveryMethod = 'TRUSTED_DROP' | 'PERSONAL_HANDOVER' | 'SECURITY_RECEPTION';
export type SubscriptionFundingCycle = 'FULL_PLAN' | 'WEEKLY';
export type SubscriptionStatus =
  | 'PENDING_CASH_COLLECTION'
  | 'ACTIVE'
  | 'PAYMENT_DUE'
  | 'GRACE_PERIOD'
  | 'PAUSED'
  | 'CANCELLED'
  | 'COMPLETED';
export type SubscriptionDeliveryStatus =
  | 'SCHEDULED'
  | 'GENERATING'
  | 'ORDER_GENERATED'
  | 'PREPARING'
  | 'PACKED'
  | 'ASSIGNED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'SKIPPED'
  | 'FAILED'
  | 'RESCHEDULED'
  | 'CANCELLED';

export type SubscriptionPlanItem = {
  productId: string;
  quantityPerDelivery: number;
  name?: string;
  product?: { id?: string; name?: string; image?: string | null } | null;
};

export type SubscriptionPlan = {
  id: string;
  code: string;
  name: string;
  internalName?: string;
  description?: string | null;
  imageUrl?: string | null;
  mobileImageUrl?: string | null;
  fundingCycle: SubscriptionFundingCycle;
  durationDays: number;
  totalDeliveries: number;
  deliveryFrequency: string;
  pricePaise: number;
  mrpPaise: number;
  currency?: string;
  defaultWindowStartMinute: number;
  defaultWindowEndMinute: number;
  allowTrustedDrop: boolean;
  allowPersonalHandover: boolean;
  allowSecurityHandover: boolean;
  allowPause: boolean;
  allowSkip: boolean;
  maximumSkips: number;
  items: SubscriptionPlanItem[];
};

export type CustomerAddress = {
  id: string;
  label?: string | null;
  line1?: string | null;
  addressLine1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  postalCode?: string | null;
  isDefault?: boolean;
};

export type SubscriptionQuote = {
  planId: string;
  totalAmountPaise: number;
  firstCashCollectionPaise: number;
  laterDeliveryAmountPaise: number;
  totalDeliveries: number;
  confirmationMessage?: string;
};

export type SubscriptionDelivery = {
  id: string;
  subscriptionId: string;
  serviceDate: string;
  sequenceNumber: number;
  status: SubscriptionDeliveryStatus;
  cashDuePaise: number;
  orderId?: string | null;
  deliveryJobId?: string | null;
  proofReference?: string | null;
  failureReason?: string | null;
  skipReason?: string | null;
};

export type SubscriptionFundingAllocation = {
  id: string;
  amountPaise: number;
  startsAtSequence: number;
  endsAtSequence: number;
  fundedDeliveryCount: number;
  createdAt: string;
};

export type CustomerSubscription = {
  id: string;
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  planVersion?: { totalDeliveries: number; pricePaise?: number; mrpPaise?: number } | null;
  address?: CustomerAddress | null;
  startDate: string;
  endDate: string;
  nextDeliveryDate?: string | null;
  nextCashCollectionDate?: string | null;
  deliveryWindowStartMinute: number;
  deliveryWindowEndMinute: number;
  deliveryMethod: SubscriptionDeliveryMethod;
  trustedDropInstructions?: string | null;
  fundingCycle: SubscriptionFundingCycle;
  fundedDeliveryCount: number;
  remainingFundedDeliveries: number;
  completedDeliveries: number;
  skippedDeliveries: number;
  failedDeliveries: number;
  amountDuePaise: number;
  amountCollectedPaise: number;
  fundingAllocations?: SubscriptionFundingAllocation[];
  deliveries?: SubscriptionDelivery[];
  confirmationMessage?: string;
};

export type SubscriptionTracking = {
  orderId?: string | null;
  deliveryJobId?: string | null;
  status?: string | null;
  trackingAvailable?: boolean;
};

export type CreateSubscriptionPayload = {
  planId: string;
  addressId: string;
  startDate: string;
  deliveryWindowStartMinute: number;
  deliveryWindowEndMinute: number;
  deliveryMethod: SubscriptionDeliveryMethod;
  trustedDropInstructions?: string;
  dropPointToken?: string;
};

export type UpdateSubscriptionPreferencesPayload = {
  deliveryMethod?: SubscriptionDeliveryMethod;
  deliveryWindowStartMinute?: number;
  deliveryWindowEndMinute?: number;
  trustedDropInstructions?: string;
  dropPointToken?: string;
};

function mutationHeaders(prefix: string) {
  return { headers: { 'Idempotency-Key': `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}` } };
}

export const subscriptionService = {
  plans: async (): Promise<SubscriptionPlan[]> => {
    const response = await apiClient.get<SubscriptionPlan[]>('/subscriptions/plans');
    return Array.isArray(response.data) ? response.data : [];
  },
  plan: async (id: string): Promise<SubscriptionPlan> => {
    const response = await apiClient.get<SubscriptionPlan>(`/subscriptions/plans/${encodeURIComponent(id)}`);
    return response.data;
  },
  quote: async (planId: string, payload: Omit<CreateSubscriptionPayload, 'planId' | 'trustedDropInstructions' | 'dropPointToken'>): Promise<SubscriptionQuote> => {
    const response = await apiClient.post<SubscriptionQuote>(`/subscriptions/plans/${encodeURIComponent(planId)}/quote`, payload);
    return response.data;
  },
  create: async (payload: CreateSubscriptionPayload): Promise<CustomerSubscription> => {
    const response = await apiClient.post<CustomerSubscription>('/customer/subscriptions', payload, mutationHeaders('customer-subscription-create'));
    return response.data;
  },
  mine: async (): Promise<CustomerSubscription[]> => {
    const response = await apiClient.get<CustomerSubscription[]>('/customer/subscriptions');
    return Array.isArray(response.data) ? response.data : [];
  },
  one: async (id: string): Promise<CustomerSubscription> => {
    const response = await apiClient.get<CustomerSubscription>(`/customer/subscriptions/${encodeURIComponent(id)}`);
    return response.data;
  },
  deliveries: async (id: string): Promise<SubscriptionDelivery[]> => {
    const response = await apiClient.get<SubscriptionDelivery[]>(`/customer/subscriptions/${encodeURIComponent(id)}/deliveries`);
    return Array.isArray(response.data) ? response.data : [];
  },
  skip: async (id: string, deliveryId: string, reason: string): Promise<CustomerSubscription> => {
    const response = await apiClient.post<CustomerSubscription>(
      `/customer/subscriptions/${encodeURIComponent(id)}/deliveries/${encodeURIComponent(deliveryId)}/skip`,
      { reason },
      mutationHeaders('customer-subscription-skip'),
    );
    return response.data;
  },
  pause: async (id: string, effectiveFrom: string, reason: string): Promise<CustomerSubscription> => {
    const response = await apiClient.post<CustomerSubscription>(
      `/customer/subscriptions/${encodeURIComponent(id)}/pause`,
      { effectiveFrom, reason },
      mutationHeaders('customer-subscription-pause'),
    );
    return response.data;
  },
  resume: async (id: string): Promise<CustomerSubscription> => {
    const response = await apiClient.post<CustomerSubscription>(
      `/customer/subscriptions/${encodeURIComponent(id)}/resume`,
      {},
      mutationHeaders('customer-subscription-resume'),
    );
    return response.data;
  },
  preferences: async (id: string, payload: UpdateSubscriptionPreferencesPayload): Promise<CustomerSubscription> => {
    const response = await apiClient.patch<CustomerSubscription>(
      `/customer/subscriptions/${encodeURIComponent(id)}/preferences`,
      payload,
      mutationHeaders('customer-subscription-preferences'),
    );
    return response.data;
  },
  cancel: async (id: string, reason: string): Promise<CustomerSubscription> => {
    const response = await apiClient.post<CustomerSubscription>(
      `/customer/subscriptions/${encodeURIComponent(id)}/cancel`,
      { reason },
      mutationHeaders('customer-subscription-cancel'),
    );
    return response.data;
  },
  tracking: async (id: string): Promise<SubscriptionTracking> => {
    const response = await apiClient.get<SubscriptionTracking>(`/customer/subscriptions/${encodeURIComponent(id)}/tracking`);
    return response.data;
  },
  reportIssue: async (id: string, deliveryId: string, type: string, description: string): Promise<{ id: string }> => {
    const response = await apiClient.post<{ id: string }>(
      `/customer/subscriptions/${encodeURIComponent(id)}/deliveries/${encodeURIComponent(deliveryId)}/issues`,
      { type, description },
      mutationHeaders('customer-subscription-issue'),
    );
    return response.data;
  },
};
