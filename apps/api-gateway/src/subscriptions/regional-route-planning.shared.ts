/**
 * Shared planning types and pure route helpers.
 *
 * Split out of the former regional-route-planning.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException } from '@nestjs/common';
import { DeliveryRunStatus, DeliveryZone, Prisma, Role } from '@aagam/database';
import { createHash } from 'crypto';
import { GeoPoint, RouteConstraints } from './regional-routing.geometry';

export type PlanningDelivery = Prisma.SubscriptionDeliveryGetPayload<{
  include: {
    subscription: { include: { address: true } };
    order: { include: { items: true; payment: true } };
    store: true;
  };
}>;

export type ResolvedDelivery = {
  delivery: PlanningDelivery;
  zone: DeliveryZone;
  point: GeoPoint;
  window: { start: Date; end: Date };
  handlingRequirement: string;
  vehicleRequirement: string;
  paymentRequirement: string;
  weightGrams: number;
};

export type RegionalRouteActor = { id: string; role: Role };

export type RiderScore = {
  riderId: string;
  userId: string;
  score: number;
  summary: string;
  constraints: Prisma.JsonObject;
};

export const ACTIVE_RUN_STATUSES = [
  DeliveryRunStatus.PLANNED,
  DeliveryRunStatus.RIDER_NEEDED,
  DeliveryRunStatus.READY_FOR_PICKUP,
  DeliveryRunStatus.PICKED_UP,
  DeliveryRunStatus.IN_PROGRESS,
  DeliveryRunStatus.RETURNING,
  DeliveryRunStatus.AWAITING_SETTLEMENT,
  DeliveryRunStatus.RECOVERY_REQUIRED,
];

export function jsonRecord(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
}

export function textFromJson(value: Prisma.JsonValue | undefined, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : fallback;
}

export function routeHash(value: string, length = 10) {
  return createHash('sha256').update(value).digest('hex').slice(0, length).toUpperCase();
}

export function routeCode(serviceDate: Date, zoneCode: string, clusterIndex: number, fingerprint: string) {
  const date = serviceDate.toISOString().slice(0, 10).replaceAll('-', '');
  const safeZone = zoneCode.replace(/[^A-Z0-9]+/g, '').slice(0, 8) || 'ZONE';
  return `RUN-${safeZone}-${date}-${String(clusterIndex + 1).padStart(2, '0')}-${routeHash(fingerprint, 6)}`;
}

export function policy(zone: DeliveryZone, window?: { start: Date; end: Date }): RouteConstraints {
  const slotMinutes = window ? Math.floor((window.end.getTime() - window.start.getTime()) / 60_000) : zone.maximumEstimatedDurationMinutes;
  const bufferedSlotMinutes = Math.max(1, slotMinutes - Math.max(0, zone.slotEndBufferMinutes));
  return {
    maximumStops: Math.max(1, zone.maximumStopsPerRun),
    maximumParcels: Math.max(1, zone.maximumParcelCount),
    maximumCashPaise: Math.max(0, zone.cashRiskLimitPaise),
    maximumWeightGrams: zone.maximumWeightKg == null ? undefined : Math.max(0, Math.floor(zone.maximumWeightKg * 1000)),
    maximumDistanceKm: Math.max(0.1, zone.maximumRouteDistanceKm),
    maximumDurationMinutes: Math.max(1, Math.min(zone.maximumEstimatedDurationMinutes, bufferedSlotMinutes)),
    averageSpeedKph: Math.max(5, Number(process.env.ROUTE_AVERAGE_SPEED_KPH || 22)),
    serviceMinutesPerStop: Math.max(1, Number(process.env.ROUTE_SERVICE_MINUTES_PER_STOP || 5)),
  };
}

export function pointFor(delivery: PlanningDelivery): GeoPoint | null {
  const latitude = Number(delivery.order?.deliveryLat ?? delivery.subscription.address.latitude);
  const longitude = Number(delivery.order?.deliveryLng ?? delivery.subscription.address.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

export function hardConstraintFields(delivery: PlanningDelivery) {
  const rules = jsonRecord(delivery.subscription.policySnapshot);
  const items = Array.isArray(delivery.subscription.itemsSnapshot) ? delivery.subscription.itemsSnapshot : [];
  const firstItem = items.find((item) => item && typeof item === 'object' && !Array.isArray(item)) as Record<string, Prisma.JsonValue> | undefined;
  return {
    handlingRequirement: textFromJson(rules.temperatureRequirement ?? firstItem?.temperatureRequirement, 'STANDARD'),
    vehicleRequirement: textFromJson(rules.vehicleRequirement, 'ANY'),
    paymentRequirement: delivery.cashDuePaise > 0 ? 'CASH_COLLECTION' : 'SUBSCRIPTION_FUNDED',
  };
}

export function weightForDelivery(delivery: PlanningDelivery) {
  const items = Array.isArray(delivery.subscription.itemsSnapshot) ? delivery.subscription.itemsSnapshot : [];
  let total = 0;
  for (const raw of items) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const item = raw as Record<string, Prisma.JsonValue>;
    const quantity = Number(item.quantityPerDelivery ?? item.quantity ?? 0);
    const unitWeight = Number(item.weightGrams ?? 0);
    if (!Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(unitWeight) || unitWeight <= 0) {
      throw new BadRequestException('Subscription item weight snapshot is missing or invalid');
    }
    total += quantity * unitWeight;
  }
  if (total <= 0) throw new BadRequestException('Subscription delivery weight snapshot is missing');
  return Math.round(total);
}
