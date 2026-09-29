/**
 * Shared checkout types, preorder constants and pure helpers.
 *
 * Split out of the former checkout.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */

export const PREORDER_MIN_LEAD_MINUTES = Math.max(30, Number(process.env.PREORDER_MIN_LEAD_MINUTES || 60));
export const PREORDER_HORIZON_DAYS = Math.min(30, Math.max(1, Number(process.env.PREORDER_HORIZON_DAYS || 7)));
export const PREORDER_SLOT_CAPACITY = Math.max(1, Number(process.env.PREORDER_SLOT_CAPACITY || 30));

export type CartItem = { productId: string; quantity: number };

export type ResolvedStore = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  operatingHours: unknown;
  timezone: string | null;
};

export function computeEtaMinutes(distanceKm: number | null): number | null {
  if (distanceKm === null || !Number.isFinite(distanceKm)) return null;
  return Math.max(10, Math.ceil(distanceKm * 6 + 8));
}

export function normalizeItems(items: Array<{ productId: string; quantity: number }>) {
  const byProduct = new Map<string, number>();
  for (const item of items) {
    const current = byProduct.get(item.productId) ?? 0;
    byProduct.set(item.productId, current + item.quantity);
  }
  return Array.from(byProduct.entries()).map(([productId, quantity]) => ({ productId, quantity }));
}
