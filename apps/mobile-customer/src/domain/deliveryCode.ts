export type CustomerDeliveryContext = {
  orderId: string;
  orderStatus: string;
  deliveryJobId: string | null;
  deliveryStatus: string | null;
  updatedAt: string | null;
};

export function shouldShowDeliveryCode(deliveryStatus?: string | null) {
  return deliveryStatus === 'RIDER_AT_CUSTOMER';
}

export function secondsUntilExpiry(expiresAt?: string | null, nowMs = Date.now()) {
  if (!expiresAt) return 0;
  const expiryMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiryMs)) return 0;
  return Math.max(0, Math.ceil((expiryMs - nowMs) / 1000));
}

export function formatDeliveryCode(code?: string | null) {
  return String(code || '')
    .replace(/\D/g, '')
    .slice(0, 6)
    .split('')
    .join(' ');
}
