/**
 * Shared checkout store resolution and delivery-window validation.
 *
 * Split out of the former checkout.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { prisma } from '@aagam/database';
import { CheckoutPlaceOrderDto } from './dto/checkout.dto';
import { calculateDistance } from '@aagam/utils';
import { CartItem, ResolvedStore, PREORDER_MIN_LEAD_MINUTES, PREORDER_HORIZON_DAYS } from './checkout.shared';

const haversineKm = calculateDistance;

export class CheckoutServiceBase {
  protected nearestStore(lat: number, lng: number, stores: ResolvedStore[]) {
    let best = stores[0];
    let bestDistance = haversineKm(lat, lng, best.latitude, best.longitude);
    for (const store of stores.slice(1)) {
      const distance = haversineKm(lat, lng, store.latitude, store.longitude);
      if (distance < bestDistance) {
        best = store;
        bestDistance = distance;
      }
    }
    return { store: best, distanceKm: bestDistance };
  }

  protected async resolveStoreForLocation(lat: number, lng: number, requiredItems: CartItem[] = []) {
    const stores = await prisma.store.findMany({
      where: { isActive: true, deletedAt: null },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        operatingHours: true,
        timezone: true,
      },
    });
    if (stores.length === 0) {
      throw new NotFoundException('No active stores available');
    }

    if (requiredItems.length === 0) {
      return this.nearestStore(lat, lng, stores);
    }

    const productIds = requiredItems.map((item) => item.productId);
    const inventoryRows = await prisma.inventory.findMany({
      where: { storeId: { in: stores.map((store) => store.id) }, productId: { in: productIds } },
      select: { storeId: true, productId: true, quantity: true },
    });

    const byStore = new Map<string, Map<string, number>>();
    for (const row of inventoryRows) {
      if (!byStore.has(row.storeId)) byStore.set(row.storeId, new Map<string, number>());
      byStore.get(row.storeId)!.set(row.productId, row.quantity);
    }

    const capableStores = stores.filter((store) => {
      const stock = byStore.get(store.id);
      return requiredItems.every((item) => (stock?.get(item.productId) ?? 0) >= item.quantity);
    });

    // Prefer the nearest store that can fully serve the cart. If none can, fall back to nearest
    // active store so quote can still expose item-level stock state instead of hiding the cart.
    return this.nearestStore(lat, lng, capableStores.length > 0 ? capableStores : stores);
  }

  protected validateDeliveryWindow(dto: CheckoutPlaceOrderDto) {
    if (!dto.deliveryWindowStart && !dto.deliveryWindowEnd) return null;
    if (!dto.deliveryWindowStart || !dto.deliveryWindowEnd) {
      throw new BadRequestException('Both delivery window start and end are required');
    }
    const start = new Date(dto.deliveryWindowStart);
    const end = new Date(dto.deliveryWindowEnd);
    const now = Date.now();
    if (start.getTime() < now + PREORDER_MIN_LEAD_MINUTES * 60_000) {
      throw new BadRequestException(`Scheduled delivery requires at least ${PREORDER_MIN_LEAD_MINUTES} minutes lead time`);
    }
    if (start.getTime() > now + PREORDER_HORIZON_DAYS * 86_400_000) {
      throw new BadRequestException(`Scheduled delivery can be booked only ${PREORDER_HORIZON_DAYS} days ahead`);
    }
    if (end <= start || end.getTime() - start.getTime() > 6 * 60 * 60_000) {
      throw new BadRequestException('Invalid delivery window');
    }
    return { start, end };
  }
}
