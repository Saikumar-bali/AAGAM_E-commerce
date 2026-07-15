import { z } from "zod";

export const ROLE_VALUES = [
  "CUSTOMER",
  "RIDER",
  "ADMIN",
  "STORE_OWNER",
] as const;
export const ORDER_STATUS_VALUES = [
  "PENDING",
  "PAYMENT_PENDING",
  "PAYMENT_FAILED",
  "CONFIRMED",
  "PICKING",
  "PACKED",
  "RIDER_ASSIGNED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
] as const;
export const DELIVERY_JOB_STATUS_VALUES = [
  "WAITING_FOR_DISPATCH",
  "RIDER_ASSIGNED",
  "RIDER_EN_ROUTE_TO_STORE",
  "RIDER_AT_STORE",
  "PICKUP_VERIFIED",
  "OUT_FOR_DELIVERY",
  "RIDER_AT_CUSTOMER",
  "DELIVERED",
  "DELIVERY_FAILED",
  "RETURNING_TO_STORE",
  "RETURNED_TO_STORE",
  "CANCELLED",
] as const;
export const DISPATCH_ASSIGNMENT_STATUS_VALUES = [
  "CREATED",
  "OFFERED",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
  "REASSIGNED",
] as const;
export const DELIVERY_EVENT_TYPE_VALUES = [
  "JOB_CREATED",
  "JOB_STATUS_CHANGED",
  "ASSIGNMENT_CREATED",
  "ASSIGNMENT_OFFERED",
  "ASSIGNMENT_ACCEPTED",
  "ASSIGNMENT_REJECTED",
  "ASSIGNMENT_EXPIRED",
  "ASSIGNMENT_CANCELLED",
  "ASSIGNMENT_REASSIGNED",
  "LEGACY_ADAPTER_USED",
] as const;
export const NOTIFICATION_EVENT_TYPE_VALUES = [
  "ORDER_PLACED",
  "STORE_ACCEPTED_ORDER",
  "STORE_STARTED_PICKING",
  "ORDER_PACKED",
  "DISPATCH_JOB_CREATED",
  "ASSIGNMENT_OFFERED",
  "ASSIGNMENT_ACCEPTED",
  "ASSIGNMENT_REJECTED",
  "ASSIGNMENT_EXPIRED",
  "RIDER_EN_ROUTE_TO_STORE",
  "RIDER_AT_STORE",
  "PICKUP_VERIFIED",
  "OUT_FOR_DELIVERY",
  "RIDER_AT_CUSTOMER",
  "DELIVERY_COMPLETED",
  "DELIVERY_FAILED",
  "DELIVERY_CANCELLED",
  "ADMIN_BROADCAST",
] as const;
export const PUSH_PROVIDER_VALUES = [
  "FCM_WEB",
  "FCM_MOBILE",
  "WEB_PUSH",
] as const;
export const NOTIFICATION_RECIPIENT_STATUS_VALUES = [
  "QUEUED",
  "SENT",
  "FAILED",
  "OPENED",
  "READ",
] as const;
export const OUTBOX_STATUS_VALUES = [
  "PENDING",
  "PROCESSING",
  "PROCESSED",
  "FAILED",
] as const;
export const PAYMENT_METHOD_VALUES = ["ONLINE", "COD"] as const;
export const PAYMENT_STATUS_VALUES = [
  "CREATED",
  "CAPTURED",
  "FAILED",
  "PENDING_COD",
] as const;

function enumObject<T extends readonly string[]>(values: T) {
  return Object.freeze(
    values.reduce(
      (acc, value) => ({ ...acc, [value]: value }),
      {} as Record<T[number], T[number]>
    )
  );
}

export const DeliveryJobStatus = enumObject(DELIVERY_JOB_STATUS_VALUES);
export const DispatchAssignmentStatus = enumObject(
  DISPATCH_ASSIGNMENT_STATUS_VALUES
);
export const DeliveryEventType = enumObject(DELIVERY_EVENT_TYPE_VALUES);
export const NotificationEventType = enumObject(NOTIFICATION_EVENT_TYPE_VALUES);
export const PushProvider = enumObject(PUSH_PROVIDER_VALUES);

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

export const DeliveryProofSchema = z
  .object({
    proofType: z.literal("CUSTOMER_OTP_PIN").default("CUSTOMER_OTP_PIN"),
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "A 6-digit customer OTP/PIN is required"),
    riderConfirmed: z.literal(true),
    note: z.string().trim().max(500).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    accuracyMetres: z.number().min(0).max(10000).optional(),
  })
  .refine((value) => (value.latitude == null) === (value.longitude == null), {
    message: "latitude and longitude must be provided together",
  });

export const DeliveryJobTransitionSchema = z.object({
  metadata: z.record(z.unknown()).optional(),
});

export const RegisterPushSubscriptionSchema = z
  .object({
    provider: z.enum(PUSH_PROVIDER_VALUES).default("FCM_WEB"),
    token: z.string().trim().min(10).max(8192).optional(),
    endpoint: z.string().trim().max(8192).optional(),
    p256dh: z.string().trim().max(4096).optional(),
    auth: z.string().trim().max(4096).optional(),
    userAgent: z.string().trim().max(1000).optional(),
    deviceName: z.string().trim().max(120).optional(),
  })
  .refine((value) => Boolean(value.token || value.endpoint), {
    message: "token or endpoint is required",
  });

export const UpdateNotificationPreferenceSchema = z.object({
  eventType: z.string().trim().min(1).max(100).default("*"),
  pushEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
});

export const AdminBroadcastSchema = z.object({
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(2).max(500),
  audience: z
    .enum(["ALL_USERS", "CUSTOMERS", "RIDERS", "STORE_OWNERS", "ADMINS"])
    .default("ALL_USERS"),
  deepLink: z.string().trim().max(500).optional(),
});

export type RoleType = (typeof ROLE_VALUES)[number];
export type OrderStatusType = (typeof ORDER_STATUS_VALUES)[number];
export type DeliveryJobStatusType = (typeof DELIVERY_JOB_STATUS_VALUES)[number];
export type DispatchAssignmentStatusType =
  (typeof DISPATCH_ASSIGNMENT_STATUS_VALUES)[number];
export type DeliveryEventTypeType = (typeof DELIVERY_EVENT_TYPE_VALUES)[number];
export type NotificationEventTypeType =
  (typeof NOTIFICATION_EVENT_TYPE_VALUES)[number];
export type PushProviderType = (typeof PUSH_PROVIDER_VALUES)[number];
export type NotificationRecipientStatusType =
  (typeof NOTIFICATION_RECIPIENT_STATUS_VALUES)[number];
export type OutboxStatusType = (typeof OUTBOX_STATUS_VALUES)[number];
export type PaymentMethodType = (typeof PAYMENT_METHOD_VALUES)[number];
export type PaymentStatusType = (typeof PAYMENT_STATUS_VALUES)[number];
export type OfferDispatchAssignmentDto = z.infer<
  typeof OfferDispatchAssignmentSchema
>;
export type RejectDispatchAssignmentDto = z.infer<
  typeof RejectDispatchAssignmentSchema
>;
export type DeliveryProofDto = z.infer<typeof DeliveryProofSchema>;
export type DeliveryJobTransitionDto = z.infer<
  typeof DeliveryJobTransitionSchema
>;
export type RegisterPushSubscriptionDto = z.infer<
  typeof RegisterPushSubscriptionSchema
>;
export type UpdateNotificationPreferenceDto = z.infer<
  typeof UpdateNotificationPreferenceSchema
>;
export type AdminBroadcastDto = z.infer<typeof AdminBroadcastSchema>;

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

export interface NotificationInboxItemDto {
  id: string;
  recipientId: string;
  sourceHistoryId: string;
  orderId?: string | null;
  deliveryJobId?: string | null;
  type: NotificationEventTypeType;
  title: string;
  body: string;
  deepLink?: string | null;
  createdAt: string | Date;
  sentAt?: string | Date | null;
  openedAt?: string | Date | null;
  readAt?: string | Date | null;
  status: NotificationRecipientStatusType;
  metadata?: Record<string, unknown> | null;
}

export interface NotificationOutboxPayloadDto {
  orderId?: string;
  deliveryJobId?: string;
  assignmentId?: string;
  riderUserId?: string;
  actorUserId?: string;
  actorRole?: RoleType;
  fromStatus?: string | null;
  toStatus?: string | null;
  title?: string;
  body?: string;
  audience?: string;
  deepLink?: string;
  metadata?: Record<string, unknown>;
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
  category?: { id: string; name: string } | null;
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
    user?: { name?: string | null; phone?: string | null } | null;
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
