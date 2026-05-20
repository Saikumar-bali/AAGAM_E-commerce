import { z } from 'zod';

export const ROLE_VALUES = ['CUSTOMER', 'RIDER', 'ADMIN', 'STORE_OWNER'] as const;
export const ORDER_STATUS_VALUES = [
  'PENDING',
  'PAYMENT_PENDING',
  'PAYMENT_FAILED',
  'CONFIRMED',
  'PICKING',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
] as const;
export const PAYMENT_METHOD_VALUES = ['ONLINE', 'COD'] as const;
export const PAYMENT_STATUS_VALUES = ['CREATED', 'CAPTURED', 'FAILED', 'PENDING_COD'] as const;

export const UserSchema = z.object({
  id: z.string().cuid(),
  email: z.string().email(),
  name: z.string().optional(),
  role: z.enum(ROLE_VALUES),
});

export const OrderSchema = z.object({
  id: z.string().cuid(),
  customerId: z.string(),
  storeId: z.string(),
  status: z.enum(ORDER_STATUS_VALUES),
  totalAmount: z.number(),
});

export type RoleType = (typeof ROLE_VALUES)[number];
export type OrderStatusType = (typeof ORDER_STATUS_VALUES)[number];
export type PaymentMethodType = (typeof PAYMENT_METHOD_VALUES)[number];
export type PaymentStatusType = (typeof PAYMENT_STATUS_VALUES)[number];

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
