export type StoreOrderTab = 'NEW' | 'PREPARING' | 'READY' | 'PICKUP' | 'DELIVERED';
export type StorePickupTab = 'WAITING' | 'EN_ROUTE' | 'OTHER';

export type StorePickupReceipt = {
  deliveryJobId: string;
  orderId: string;
  riderName: string;
  riderPhone: string | null;
  riderRating: number | null;
  customerName: string;
  paymentMethod: string;
  parcelCount: number;
  pickupTime: string;
};

export function shortStoreOrderId(value?: string | null) {
  return value ? value.slice(-8).toUpperCase() : 'UNKNOWN';
}

export function formatStoreMoney(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `₹${number.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function orderItems(order: any) {
  return Array.isArray(order?.items) ? order.items : [];
}

export function orderUnitCount(order: any) {
  return orderItems(order).reduce(
    (total: number, item: any) => total + Math.max(0, Number(item?.quantity || 0)),
    0,
  );
}

export function orderPaymentMethod(order: any) {
  const method = String(
    order?.payment?.method
      || order?.paymentMethod
      || order?.payment?.type
      || '',
  ).toUpperCase();
  if (method === 'COD' || method.includes('CASH')) return 'COD';
  if (method) return 'Prepaid';
  return 'Payment unavailable';
}

export function orderCustomerName(order: any) {
  return order?.customer?.name
    || order?.addressSnapshot?.recipientName
    || 'Customer';
}

export function orderCustomerPhone(order: any) {
  return order?.customer?.phone
    || order?.addressSnapshot?.phoneE164
    || null;
}

export function orderStatusTab(status?: string | null): StoreOrderTab | null {
  if (status === 'PENDING' || status === 'PAYMENT_PENDING') return 'NEW';
  if (status === 'CONFIRMED' || status === 'PICKING') return 'PREPARING';
  if (status === 'PACKED') return 'READY';
  if (status === 'RIDER_ASSIGNED' || status === 'OUT_FOR_DELIVERY') return 'PICKUP';
  if (status === 'DELIVERED') return 'DELIVERED';
  return null;
}

export function summarizeStoreOrders(orders: any[]) {
  const counts: Record<StoreOrderTab, number> = {
    NEW: 0,
    PREPARING: 0,
    READY: 0,
    PICKUP: 0,
    DELIVERED: 0,
  };
  orders.forEach((order) => {
    const tab = orderStatusTab(order?.status);
    if (tab) counts[tab] += 1;
  });
  return counts;
}

export function pickupStatusTab(status?: string | null): StorePickupTab {
  if (status === 'RIDER_AT_STORE') return 'WAITING';
  if (status === 'RIDER_ASSIGNED' || status === 'PACKED') return 'EN_ROUTE';
  return 'OTHER';
}

export function riderProfile(job: any) {
  const rider = job?.currentRider?.user || job?.currentRider || job?.rider?.user || job?.rider || {};
  return {
    name: rider?.name || 'Assigned rider',
    phone: rider?.phone || rider?.phoneE164 || null,
    rating: typeof rider?.rating === 'number' ? rider.rating : null,
    vehicleNumber: rider?.vehicleNumber || rider?.vehicle?.registrationNumber || null,
  };
}

export function pickupParcelCount(job: any) {
  const explicit = [
    job?.parcelCount,
    job?.pickupParcelCount,
    job?.pickupReadiness?.task?.parcelCount,
  ].find((value) => Number.isInteger(Number(value)) && Number(value) > 0);
  return explicit == null ? Math.max(1, orderItems(job?.order).length) : Number(explicit);
}

export function buildStorePickupReceipt(job: any, parcelCount: number, pickupTime = new Date()) {
  const rider = riderProfile(job);
  return {
    deliveryJobId: String(job?.id || ''),
    orderId: String(job?.order?.id || job?.orderId || ''),
    riderName: rider.name,
    riderPhone: rider.phone,
    riderRating: rider.rating,
    customerName: orderCustomerName(job?.order),
    paymentMethod: orderPaymentMethod(job?.order),
    parcelCount: Math.max(1, Math.floor(Number(parcelCount) || 1)),
    pickupTime: pickupTime.toISOString(),
  } satisfies StorePickupReceipt;
}

export function storeAssignmentStatus(store: any) {
  const status = String(store?.status || '').toUpperCase();
  if (status) return status.replaceAll('_', ' ');
  if (store?.isActive === true || store?.active === true) return 'ACTIVE';
  if (store?.isActive === false || store?.active === false) return 'PENDING';
  return 'ASSIGNED';
}
