import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma, SubscriptionDeliveryStatus, prisma } from '@aagam/database';
import { haversineKm, pointInPolygon } from './regional-routing.geometry';
import { SubscriptionCalendarService } from './subscription-calendar.service';
import { DEFAULT_DELIVERY_TIMEZONE, validateIanaTimezone } from './subscription-timezone';

export const SERVICEABILITY_REASONS = {
  ZONE_UNSERVICEABLE: 'ZONE_UNSERVICEABLE',
  PLAN_NOT_AVAILABLE_IN_ZONE: 'PLAN_NOT_AVAILABLE_IN_ZONE',
  STORE_UNAVAILABLE: 'STORE_UNAVAILABLE',
  STORE_OUT_OF_RADIUS: 'STORE_OUT_OF_RADIUS',
  INVENTORY_UNAVAILABLE: 'INVENTORY_UNAVAILABLE',
  CAPACITY_EXHAUSTED: 'CAPACITY_EXHAUSTED',
  WINDOW_UNAVAILABLE: 'WINDOW_UNAVAILABLE',
  FUNDING_REQUIRED: 'FUNDING_REQUIRED',
  SUBSCRIPTION_PAUSED: 'SUBSCRIPTION_PAUSED',
} as const;

export type ServiceabilityReason = typeof SERVICEABILITY_REASONS[keyof typeof SERVICEABILITY_REASONS];

type Db = Prisma.TransactionClient | typeof prisma;

type ServiceabilityItem = {
  productId: string;
  quantity: number;
  weightGrams?: number | null;
};

type ServiceabilityAddress = {
  latitude: number;
  longitude: number;
};

type ResolverInput = {
  address: ServiceabilityAddress;
  serviceDates: Date[];
  deliveryWindowStartMinute: number;
  deliveryWindowEndMinute: number;
  items: ServiceabilityItem[];
  allowedZoneIds?: string[];
  allowedStoreIds?: string[];
  preferredStoreId?: string | null;
  excludeDeliveryId?: string;
  requireWeight?: boolean;
};

function deferred(reason: ServiceabilityReason, message: string): never {
  const error = new ConflictException(message) as ConflictException & { serviceabilityReason?: ServiceabilityReason };
  error.serviceabilityReason = reason;
  throw error;
}

function jsonArray(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value) ? value : [];
}

function slotRecord(value: Prisma.JsonValue): { startMinute: number; endMinute: number } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, Prisma.JsonValue>;
  const startMinute = Number(raw.startMinute);
  const endMinute = Number(raw.endMinute);
  return Number.isInteger(startMinute) && Number.isInteger(endMinute) ? { startMinute, endMinute } : null;
}

@Injectable()
export class SubscriptionServiceabilityService {
  constructor(private readonly calendar: SubscriptionCalendarService) {}

  async resolve(input: ResolverInput, db: Db = prisma) {
    if (!Number.isFinite(input.address.latitude) || !Number.isFinite(input.address.longitude)) {
      deferred(SERVICEABILITY_REASONS.ZONE_UNSERVICEABLE, 'Authoritative delivery coordinates are missing');
    }
    if (!input.serviceDates.length) throw new BadRequestException('At least one service date is required');
    if (!input.items.length || input.items.some((item) => !item.productId || !Number.isInteger(item.quantity) || item.quantity < 1)) {
      throw new BadRequestException('Subscription items are invalid');
    }
    if (input.requireWeight && input.items.some((item) => !Number.isInteger(item.weightGrams) || Number(item.weightGrams) <= 0)) {
      throw new BadRequestException('Subscription products require a positive unit weight before routing can be enabled');
    }

    const zones = await db.deliveryZone.findMany({
      where: { isActive: true },
      orderBy: [{ priority: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      include: { storeLinks: true },
    });
    const point = { latitude: input.address.latitude, longitude: input.address.longitude };
    const polygon = zones.find((zone) => zone.polygon && pointInPolygon(point, zone.polygon));
    const radius = zones
      .flatMap((zone) => {
        if (zone.centerLatitude === null || zone.centerLongitude === null || zone.fallbackRadiusKm === null) return [];
        const distanceKm = haversineKm(point, { latitude: zone.centerLatitude, longitude: zone.centerLongitude });
        return distanceKm <= zone.fallbackRadiusKm ? [{ zone, distanceKm }] : [];
      })
      .sort((left, right) => right.zone.priority - left.zone.priority || left.distanceKm - right.distanceKm)[0]?.zone;
    const zone = polygon ?? radius;
    if (!zone) deferred(SERVICEABILITY_REASONS.ZONE_UNSERVICEABLE, 'Address is outside all active delivery zones');
    if (input.allowedZoneIds?.length && !input.allowedZoneIds.includes(zone.id)) {
      deferred(SERVICEABILITY_REASONS.PLAN_NOT_AVAILABLE_IN_ZONE, 'This subscription plan is not available in the resolved delivery zone');
    }
    const timezone = validateIanaTimezone(zone.timezone || DEFAULT_DELIVERY_TIMEZONE);

    const windowMetadata = input.serviceDates.map((serviceDate) =>
      this.calendar.windowMetadata(
        serviceDate,
        input.deliveryWindowStartMinute,
        input.deliveryWindowEndMinute,
        timezone,
      ),
    );
    const configuredSlots = jsonArray(zone.deliverySlots).map(slotRecord).filter((slot): slot is NonNullable<typeof slot> => Boolean(slot));
    const slotEndBufferMinutes = Math.max(0, zone.slotEndBufferMinutes);
    const minimumRouteMinutes = Math.max(1, Number(process.env.ROUTE_SERVICE_MINUTES_PER_STOP || 5));
    for (let index = 0; index < input.serviceDates.length; index += 1) {
      const requested = windowMetadata[index];
      const requestedMinutes = Math.round((requested.utcEnd.getTime() - requested.utcStart.getTime()) / 60_000);
      if (requestedMinutes <= slotEndBufferMinutes || minimumRouteMinutes > requestedMinutes - slotEndBufferMinutes) {
        deferred(SERVICEABILITY_REASONS.WINDOW_UNAVAILABLE, 'Requested delivery window does not leave enough route time before the slot safety buffer');
      }
      if (configuredSlots.length) {
        const fits = configuredSlots.some((slot) => {
          const candidate = this.calendar.window(input.serviceDates[index], slot.startMinute, slot.endMinute, timezone);
          return requested.utcStart >= candidate.start && requested.utcEnd <= candidate.end;
        });
        if (!fits) deferred(SERVICEABILITY_REASONS.WINDOW_UNAVAILABLE, 'Requested delivery window is outside configured zone delivery slots');
      }
    }

    const zoneStoreIds = zone.storeLinks.map((link) => link.storeId);
    const allowedStoreIds = input.allowedStoreIds?.length ? input.allowedStoreIds : undefined;
    const stores = await db.store.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        ...(allowedStoreIds ? { id: { in: allowedStoreIds } } : {}),
        ...(zoneStoreIds.length ? { id: { in: zoneStoreIds } } : {}),
      },
      select: { id: true, name: true, latitude: true, longitude: true },
    });
    if (!stores.length) deferred(SERVICEABILITY_REASONS.STORE_UNAVAILABLE, 'No active store is eligible for this plan and delivery zone');

    const maxStoreRadiusKm = Math.max(0.1, Number(process.env.SUBSCRIPTION_STORE_DELIVERY_RADIUS_KM || 25));
    const inRadius = stores
      .map((store) => ({ store, distanceKm: haversineKm(point, { latitude: store.latitude, longitude: store.longitude }) }))
      .filter((row) => row.distanceKm <= maxStoreRadiusKm);
    if (!inRadius.length) deferred(SERVICEABILITY_REASONS.STORE_OUT_OF_RADIUS, 'Eligible stores are outside the configured delivery radius');

    const inventory = await db.inventory.findMany({
      where: {
        storeId: { in: inRadius.map((row) => row.store.id) },
        productId: { in: input.items.map((item) => item.productId) },
      },
      select: { storeId: true, productId: true, quantity: true, isListed: true },
    });
    const byStore = new Map<string, Map<string, { quantity: number; isListed: boolean }>>();
    for (const row of inventory) {
      if (!byStore.has(row.storeId)) byStore.set(row.storeId, new Map());
      byStore.get(row.storeId)!.set(row.productId, { quantity: row.quantity, isListed: row.isListed });
    }
    const capable = inRadius.filter(({ store }) => input.items.every((item) => {
      const stock = byStore.get(store.id)?.get(item.productId);
      return Boolean(stock?.isListed) && Number(stock?.quantity || 0) >= item.quantity;
    }));
    if (!capable.length) deferred(SERVICEABILITY_REASONS.INVENTORY_UNAVAILABLE, 'One or more subscription products are unavailable from an eligible store');
    capable.sort((left, right) => {
      const preferredLeft = left.store.id === input.preferredStoreId ? -1 : 0;
      const preferredRight = right.store.id === input.preferredStoreId ? -1 : 0;
      return preferredLeft - preferredRight || left.distanceKm - right.distanceKm || left.store.id.localeCompare(right.store.id);
    });
    const selectedStore = capable[0].store;

    const capacityChecks: Array<{ serviceDate: string; used: number; maximum: number; available: boolean }> = [];
    for (const serviceDate of input.serviceDates) {
      const dayStart = new Date(Date.UTC(serviceDate.getUTCFullYear(), serviceDate.getUTCMonth(), serviceDate.getUTCDate()));
      const dayEnd = new Date(dayStart.getTime() + 86_400_000);
      const [scheduledCount, plannedCount] = await Promise.all([
        db.subscriptionDelivery.count({
          where: {
            deliveryZoneId: zone.id,
            serviceDate: { gte: dayStart, lt: dayEnd },
            status: { notIn: [SubscriptionDeliveryStatus.CANCELLED, SubscriptionDeliveryStatus.SKIPPED] },
            ...(input.excludeDeliveryId ? { id: { not: input.excludeDeliveryId } } : {}),
          },
        }),
        db.deliveryRunStop.count({
          where: {
            deliveryZoneId: zone.id,
            deliveryRun: { serviceDate: { gte: dayStart, lt: dayEnd }, status: { not: 'CANCELLED' } },
            ...(input.excludeDeliveryId ? { subscriptionDeliveryId: { not: input.excludeDeliveryId } } : {}),
          },
        }),
      ]);
      const used = Math.max(scheduledCount, plannedCount);
      const available = used < zone.maximumDailySubscriptionCapacity;
      capacityChecks.push({ serviceDate: dayStart.toISOString().slice(0, 10), used, maximum: zone.maximumDailySubscriptionCapacity, available });
      if (!available) deferred(SERVICEABILITY_REASONS.CAPACITY_EXHAUSTED, `Subscription capacity is exhausted for ${dayStart.toISOString().slice(0, 10)}`);
    }

    return {
      zoneId: zone.id,
      zoneCode: zone.code,
      timezone,
      storeId: selectedStore.id,
      checkedServiceDates: capacityChecks.map((item) => item.serviceDate),
      localDeliveryWindow: windowMetadata.map((item) => ({
        serviceDate: item.serviceDate,
        label: item.localWindowLabel,
        start: item.localStartLabel,
        end: item.localEndLabel,
      })),
      utcWindow: windowMetadata.map((item) => ({ serviceDate: item.serviceDate, start: item.utcStart, end: item.utcEnd })),
      inventoryDecision: { available: true },
      capacityDecision: { available: true, checks: capacityChecks },
      storeDistanceKm: Math.round(capable[0].distanceKm * 100) / 100,
      slotEndBufferMinutes,
    };
  }

  reasonFromError(error: unknown): ServiceabilityReason | null {
    if (error && typeof error === 'object' && 'serviceabilityReason' in error) {
      const reason = String((error as { serviceabilityReason?: unknown }).serviceabilityReason || '');
      return Object.values(SERVICEABILITY_REASONS).includes(reason as ServiceabilityReason) ? reason as ServiceabilityReason : null;
    }
    return null;
  }
}
