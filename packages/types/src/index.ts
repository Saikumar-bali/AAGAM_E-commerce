import { z } from 'zod';

export const ROLE_VALUES = ['CUSTOMER', 'RIDER', 'ADMIN', 'STORE_OWNER'] as const;
export const ORDER_STATUS_VALUES = [
  'PENDING',
  'PAYMENT_PENDING',
  'PAYMENT_FAILED',
  'CONFIRMED',
  'PICKING',
  'PACKED',
  'RIDER_ASSIGNED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
] as const;
export const DELIVERY_JOB_STATUS_VALUES = [
  'WAITING_FOR_DISPATCH',
  'RIDER_ASSIGNED',
  'RIDER_EN_ROUTE_TO_STORE',
  'RIDER_AT_STORE',
  'PICKUP_VERIFIED',
  'OUT_FOR_DELIVERY',
  'RIDER_AT_CUSTOMER',
  'DELIVERED',
  'DELIVERY_FAILED',
  'RETURNING_TO_STORE',
  'RETURNED_TO_STORE',
  'CANCELLED',
] as const;
export const DISPATCH_ASSIGNMENT_STATUS_VALUES = [
  'CREATED',
  'OFFERED',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
  'REASSIGNED',
] as const;
export const DELIVERY_EVENT_TYPE_VALUES = [
  'JOB_CREATED',
  'JOB_STATUS_CHANGED',
  'ASSIGNMENT_CREATED',
  'ASSIGNMENT_OFFERED',
  'ASSIGNMENT_ACCEPTED',
  'ASSIGNMENT_REJECTED',
  'ASSIGNMENT_EXPIRED',
  'ASSIGNMENT_CANCELLED',
  'ASSIGNMENT_REASSIGNED',
  'LEGACY_ADAPTER_USED',
] as const;
export const PAYMENT_METHOD_VALUES = ['ONLINE', 'COD'] as const;
export const PAYMENT_STATUS_VALUES = ['CREATED', 'CAPTURED', 'FAILED', 'PENDING_COD'] as const;

export const DeliveryJobStatus = Object.freeze(
  DELIVERY_JOB_STATUS_VALUES.reduce((acc, value) => ({ ...acc, [value]: value }), {} as Record<(typeof DELIVERY_JOB_STATUS_VALUES)[number], (typeof DELIVERY_JOB_STATUS_VALUES)[number]>),
);
export const DispatchAssignmentStatus = Object.freeze(
  DISPATCH_ASSIGNMENT_STATUS_VALUES.reduce((acc, value) => ({ ...acc, [value]: value }), {} as Record<(typeof DISPATCH_ASSIGNMENT_STATUS_VALUES)[number], (typeof DISPATCH_ASSIGNMENT_STATUS_VALUES)[number]>),
);
export const DeliveryEventType = Object.freeze(
  DELIVERY_EVENT_TYPE_VALUES.reduce((acc, value) => ({ ...acc, [value]: value }), {} as Record<(typeof DELIVERY_EVENT_TYPE_VALUES)[number], (typeof DELIVERY_EVENT_TYPE_VALUES)[number]>),
);

export const UserSchema = z.object({
  id: z.string().cuid(),
  email: z.string().email(),
  name: z.string().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  emailVerified: z.boolean().optional(),
  role: z.enum(ROLE_VALUES),
});

export const OrderSchema = z.object({
  id: z.string().cuid(),
  customerId: z.string(),
  storeId: z.string(),
  status: z.enum(ORDER_STATUS_VALUES),
  totalAmount: z.number(),
});

export const OfferDispatchAssignmentSchema = z.object({
  riderUserId: z.string().min(1),
  expiresInSeconds: z.number().int().min(15).max(300).optional().default(60),
});

export const RejectDispatchAssignmentSchema = z.object({
  reason: z.string().trim().min(2).max(300).optional(),
});

export const DeliveryProofSchema = z.object({
  proofType: z.string().trim().min(2).max(80).optional(),
  code: z.string().trim().max(32).optional(),
  note: z.string().trim().max(500).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export const DeliveryJobTransitionSchema = z.object({
  metadata: z.record(z.unknown()).optional(),
});

export type RoleType = (typeof ROLE_VALUES)[number];
export type OrderStatusType = (typeof ORDER_STATUS_VALUES)[number];
export type DeliveryJobStatusType = (typeof DELIVERY_JOB_STATUS_VALUES)[number];
export type DispatchAssignmentStatusType = (typeof DISPATCH_ASSIGNMENT_STATUS_VALUES)[number];
export type DeliveryEventTypeType = (typeof DELIVERY_EVENT_TYPE_VALUES)[number];
export type PaymentMethodType = (typeof PAYMENT_METHOD_VALUES)[number];
export type PaymentStatusType = (typeof PAYMENT_STATUS_VALUES)[number];
export type OfferDispatchAssignmentDto = z.infer<typeof OfferDispatchAssignmentSchema>;
export type RejectDispatchAssignmentDto = z.infer<typeof RejectDispatchAssignmentSchema>;
export type DeliveryProofDto = z.infer<typeof DeliveryProofSchema>;
export type DeliveryJobTransitionDto = z.infer<typeof DeliveryJobTransitionSchema>;

export interface DeliveryActorDto {
  id: string;
  role: RoleType;
}

export interface DispatchAssignmentDto {
  id: string;
  deliveryJobId: string;
  riderProfileId: string;
  status: DispatchAssignmentStatusType;
  offeredAt?: string | Date | null;
  respondedAt?: string | Date | null;
  expiresAt?: string | Date | null;
  rejectionReason?: string | null;
  createdByUserId?: string | null;
}

export interface DeliveryJobDto {
  id: string;
  orderId: string;
  status: DeliveryJobStatusType;
  currentRiderId?: string | null;
  version: number;
  createdAt: string | Date;
  updatedAt: string | Date;
  assignments?: DispatchAssignmentDto[];
}

export interface AddressType {
  id: string;
  label?: string | null;
  recipientName: string;
  phoneE164: string;
  alternatePhoneE164?: string | null;
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
  latitude: number;
  longitude: number;
  instructions?: string | null;
  isDefault: boolean;
}

export interface ProductAvailabilityType {
  storeId: string | null;
  storeName: string | null;
  availableQty: number | null;
  inStock: boolean;
  serviceable: boolean | null;
  distanceKm: number | null;
}

export interface CatalogProductType {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  image?: string | null;
  categoryId: string;
  category?: {
    id: string;
    name: string;
  } | null;
  availability?: ProductAvailabilityType;
}

export interface OrderItemType {
  id?: string;
  productId: string;
  name?: string;
  image?: string | null;
  quantity: number;
  unitPrice?: number;
  price?: number;
  lineTotal?: number;
}

export interface OrderDetailType {
  id: string;
  status: OrderStatusType;
  currency: string;
  totalAmount: number;
  subtotal?: number;
  deliveryFee?: number;
  discountAmount?: number;
  taxAmount?: number;
  grandTotal?: number;
  createdAt: string;
  updatedAt?: string;
  deliveryJob?: DeliveryJobDto | null;
  payment?: {
    method: PaymentMethodType;
    status: PaymentStatusType | string;
    provider?: string;
  } | null;
  store?: {
    id?: string;
    name?: string | null;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  rider?: {
    id?: string;
    user?: {
      name?: string | null;
      phone?: string | null;
    } | null;
  } | null;
  items?: OrderItemType[];
  addressSnapshot?: AddressType | null;
  itemsSnapshot?: OrderItemType[] | null;
  pricingSnapshot?: {
    subtotal: number;
    deliveryFee: number;
    discountAmount: number;
    taxAmount: number;
    grandTotal: number;
  } | null;
}

export type UserType = z.infer<typeof UserSchema>;
export type OrderType = z.infer<typeof OrderSchema>;
