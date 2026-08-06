import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DeliveryZoneResolutionSource,
  Prisma,
  prisma,
} from '@aagam/database';
import { UpsertRegionalDeliveryZoneDto } from './regional-routing.dto';
import { GeoPoint, haversineKm, pointInPolygon } from './regional-routing.geometry';

type ZoneWithLinks = Prisma.DeliveryZoneGetPayload<{
  include: {
    storeLinks: true;
    preferredRiderLinks: true;
  };
}>;

export type ZoneResolution = {
  zone: ZoneWithLinks | null;
  source: DeliveryZoneResolutionSource;
  confidence: number;
  reason?: string;
};

@Injectable()
export class RegionalDeliveryZoneService {
  async list() {
    return prisma.deliveryZone.findMany({
      orderBy: [{ priority: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        storeLinks: { include: { store: { select: { id: true, name: true, latitude: true, longitude: true } } } },
        preferredRiderLinks: { include: { riderProfile: { include: { user: { select: { id: true, name: true } } } } } },
        _count: { select: { deliveryRuns: true, customerAddresses: true } },
      },
    });
  }

  async one(id: string) {
    const zone = await prisma.deliveryZone.findUnique({
      where: { id },
      include: {
        storeLinks: true,
        preferredRiderLinks: true,
      },
    });
    if (!zone) throw new NotFoundException('Delivery zone not found');
    return zone;
  }

  async upsert(id: string | undefined, dto: UpsertRegionalDeliveryZoneDto) {
    const code = dto.code.trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, '-');
    if (!code) throw new BadRequestException('A valid delivery-zone code is required');
    if (dto.polygon?.length && dto.polygon.length < 3) {
      throw new BadRequestException('A zone polygon requires at least three points');
    }
    if (
      (dto.centerLatitude === undefined) !== (dto.centerLongitude === undefined)
      || ((dto.centerLatitude === undefined || dto.centerLongitude === undefined) && dto.fallbackRadiusKm !== undefined)
    ) {
      throw new BadRequestException('Fallback radius requires both centre latitude and longitude');
    }
    return prisma.$transaction(async (tx) => {
      const duplicate = await tx.deliveryZone.findFirst({
        where: { code, ...(id ? { id: { not: id } } : {}) },
        select: { id: true },
      });
      if (duplicate) throw new BadRequestException('Delivery-zone code is already in use');
      const data = {
        name: dto.name.trim(),
        code,
        description: dto.description?.trim() || null,
        isActive: dto.isActive ?? true,
        priority: dto.priority ?? 0,
        polygon: dto.polygon?.length ? dto.polygon as unknown as Prisma.InputJsonValue : Prisma.JsonNull,
        centerLatitude: dto.centerLatitude ?? null,
        centerLongitude: dto.centerLongitude ?? null,
        fallbackRadiusKm: dto.fallbackRadiusKm ?? null,
        deliverySlots: dto.deliverySlots?.length ? dto.deliverySlots as unknown as Prisma.InputJsonValue : Prisma.JsonNull,
        maximumDailySubscriptionCapacity: dto.maximumDailySubscriptionCapacity ?? 200,
        maximumStopsPerRun: dto.maximumStopsPerRun ?? 15,
        maximumRouteDistanceKm: dto.maximumRouteDistanceKm ?? 30,
        maximumEstimatedDurationMinutes: dto.maximumEstimatedDurationMinutes ?? 120,
        maximumParcelCount: dto.maximumParcelCount ?? 50,
        maximumWeightKg: dto.maximumWeightKg ?? null,
        cashRiskLimitPaise: dto.cashRiskLimitPaise ?? 1_000_000,
        slotEndBufferMinutes: dto.slotEndBufferMinutes ?? 15,
        allowedVehicleTypes: (dto.allowedVehicleTypes ?? []).map((value) => value.trim().toUpperCase()).filter(Boolean),
        neighbouringZoneIds: [...new Set(dto.neighbouringZoneIds ?? [])],
      };
      const zone = id
        ? await tx.deliveryZone.update({ where: { id }, data })
        : await tx.deliveryZone.create({ data });
      if (dto.storeIds) {
        await tx.deliveryZoneStore.deleteMany({ where: { zoneId: zone.id } });
        if (dto.storeIds.length) {
          await tx.deliveryZoneStore.createMany({
            data: [...new Set(dto.storeIds)].map((storeId, priority) => ({ zoneId: zone.id, storeId, priority })),
            skipDuplicates: true,
          });
        }
      }
      if (dto.preferredRiderIds) {
        await tx.deliveryZonePreferredRider.deleteMany({ where: { zoneId: zone.id } });
        if (dto.preferredRiderIds.length) {
          await tx.deliveryZonePreferredRider.createMany({
            data: [...new Set(dto.preferredRiderIds)].map((riderProfileId, priority) => ({ zoneId: zone.id, riderProfileId, priority })),
            skipDuplicates: true,
          });
        }
      }
      return tx.deliveryZone.findUniqueOrThrow({
        where: { id: zone.id },
        include: { storeLinks: true, preferredRiderLinks: true },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async resolve(point: GeoPoint, storeId?: string | null): Promise<ZoneResolution> {
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) {
      return {
        zone: null,
        source: DeliveryZoneResolutionSource.UNRESOLVED,
        confidence: 0,
        reason: 'Authoritative delivery latitude and longitude are missing',
      };
    }
    const zones = await prisma.deliveryZone.findMany({
      where: {
        isActive: true,
        ...(storeId ? { OR: [{ storeLinks: { none: {} } }, { storeLinks: { some: { storeId } } }] } : {}),
      },
      orderBy: [{ priority: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      include: { storeLinks: true, preferredRiderLinks: true },
    });
    const polygonMatches = zones.filter((zone) => zone.polygon && pointInPolygon(point, zone.polygon));
    if (polygonMatches.length) {
      return { zone: polygonMatches[0], source: DeliveryZoneResolutionSource.POLYGON, confidence: 1 };
    }
    const radiusMatches = zones.flatMap((zone) => {
      if (
        zone.centerLatitude === null
        || zone.centerLongitude === null
        || zone.fallbackRadiusKm === null
      ) return [];
      const distanceKm = haversineKm(point, {
        latitude: zone.centerLatitude,
        longitude: zone.centerLongitude,
      });
      return distanceKm <= zone.fallbackRadiusKm ? [{ zone, distanceKm }] : [];
    }).sort((left, right) => {
      if (left.zone.priority !== right.zone.priority) return right.zone.priority - left.zone.priority;
      if (left.distanceKm !== right.distanceKm) return left.distanceKm - right.distanceKm;
      return left.zone.id.localeCompare(right.zone.id);
    });
    if (radiusMatches.length) {
      const match = radiusMatches[0];
      const confidence = Math.max(0.25, 1 - match.distanceKm / Math.max(match.zone.fallbackRadiusKm ?? 1, 0.1));
      return { zone: match.zone, source: DeliveryZoneResolutionSource.RADIUS, confidence };
    }
    return {
      zone: null,
      source: DeliveryZoneResolutionSource.UNRESOLVED,
      confidence: 0,
      reason: 'No active delivery-zone polygon or fallback radius contains this address',
    };
  }

  async persistResolution(input: {
    point: GeoPoint;
    zone: ZoneWithLinks;
    source: DeliveryZoneResolutionSource;
    confidence: number;
    customerAddressId?: string | null;
    subscriptionId?: string | null;
    subscriptionDeliveryId?: string | null;
    orderId?: string | null;
  }) {
    const snapshot = {
      id: input.zone.id,
      code: input.zone.code,
      name: input.zone.name,
      source: input.source,
      confidence: input.confidence,
      resolvedAt: new Date().toISOString(),
      latitude: input.point.latitude,
      longitude: input.point.longitude,
    } as Prisma.InputJsonValue;
    await prisma.$transaction(async (tx) => {
      if (input.customerAddressId) {
        await tx.customerAddress.updateMany({
          where: { id: input.customerAddressId },
          data: {
            deliveryZoneId: input.zone.id,
            zoneResolvedAt: new Date(),
            zoneResolutionSource: input.source,
            zoneResolutionConfidence: input.confidence,
          },
        });
      }
      if (input.subscriptionId) {
        await tx.customerSubscription.updateMany({
          where: { id: input.subscriptionId },
          data: { deliveryZoneId: input.zone.id },
        });
      }
      if (input.subscriptionDeliveryId) {
        await tx.subscriptionDelivery.updateMany({
          where: { id: input.subscriptionDeliveryId },
          data: { deliveryZoneId: input.zone.id },
        });
      }
      if (input.orderId) {
        await tx.order.updateMany({
          where: { id: input.orderId },
          data: { deliveryZoneId: input.zone.id, deliveryZoneSnapshot: snapshot },
        });
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
