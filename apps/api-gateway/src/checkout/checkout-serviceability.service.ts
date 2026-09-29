/**
 * Store serviceability and preorder slot calendar.
 *
 * Split out of the former checkout.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@aagam/database';
import { calculateDeliveryPricing } from './delivery-pricing';
import { DEFAULT_PREORDER_SLOTS, DELIVERY_TIME_ZONE } from './delivery-slots';
import { isOpenAt, nextOpenAt, windowWithinOpenHours, zonedCalendarDate, zonedSlotInstant } from '../stores/operating-hours';
import { DeliveryFeeRulesService } from '../stores/delivery-fee-rules.service';
import { CheckoutServiceBase } from './checkout.service.base';
import { PREORDER_MIN_LEAD_MINUTES, PREORDER_HORIZON_DAYS, PREORDER_SLOT_CAPACITY, computeEtaMinutes } from './checkout.shared';

@Injectable()
export class CheckoutServiceabilityService extends CheckoutServiceBase {
  constructor(private readonly deliveryFeeRules: DeliveryFeeRulesService) {
    super();
  }

  async serviceability(userId: string, addressId: string) {
    if (!addressId) throw new BadRequestException('addressId is required');
    const address = await prisma.customerAddress.findFirst({ where: { id: addressId, userId } });
    if (!address) throw new NotFoundException('Address not found');

    const resolved = await this.resolveStoreForLocation(address.latitude, address.longitude);
    const rule = await this.deliveryFeeRules.resolve(address, resolved.store.id);
    const deliveryPricing = calculateDeliveryPricing(
      resolved.distanceKm,
      undefined,
      false,
      rule ? this.deliveryFeeRules.toOverrides(rule) : {},
    );
    const now = new Date();
    const openNow = isOpenAt(resolved.store, now);
    const nextOpen = nextOpenAt(resolved.store, now);

    return {
      serviceable: deliveryPricing.serviceable,
      storeOpen: openNow,
      nextOpenAt: nextOpen ? nextOpen.toISOString() : null,
      address: {
        id: address.id,
        label: address.label,
        line1: address.line1,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        latitude: address.latitude,
        longitude: address.longitude,
      },
      store: {
        id: resolved.store.id,
        name: resolved.store.name,
      },
      distanceKm: resolved.distanceKm,
      deliveryFee: deliveryPricing.serviceable ? deliveryPricing.payableFeePaise / 100 : 0,
      deliveryFeePaise: deliveryPricing.payableFeePaise,
      deliveryPricing,
      etaMinutes: computeEtaMinutes(resolved.distanceKm),
    };
  }

  async deliverySlots(userId: string, addressId: string) {
    if (!addressId) throw new BadRequestException('addressId is required');
    const address = await prisma.customerAddress.findFirst({ where: { id: addressId, userId } });
    if (!address) throw new NotFoundException('Address not found');
    const resolved = await this.resolveStoreForLocation(address.latitude, address.longitude);
    const now = new Date();
    const timezone = resolved.store.timezone || DELIVERY_TIME_ZONE;
    const openNow = isOpenAt(resolved.store, now);
    const nextOpen = nextOpenAt(resolved.store, now);
    const earliest = new Date(now.getTime() + PREORDER_MIN_LEAD_MINUTES * 60_000);
    const horizon = new Date(now.getTime() + PREORDER_HORIZON_DAYS * 86_400_000);
    const todayInStoreTz = zonedCalendarDate(now, timezone);
    const slots: Array<Record<string, unknown>> = [];

    for (let offset = 0; offset <= PREORDER_HORIZON_DAYS; offset += 1) {
      for (const template of DEFAULT_PREORDER_SLOTS) {
        const start = zonedSlotInstant(todayInStoreTz, offset, template.startMinute, timezone);
        const end = zonedSlotInstant(todayInStoreTz, offset, template.endMinute, timezone);
        if (start < earliest || start > horizon) continue;
        if (!windowWithinOpenHours(resolved.store, start, end)) continue;
        const reserved = await prisma.order.count({
          where: {
            storeId: resolved.store.id,
            status: { notIn: ['CANCELLED', 'PAYMENT_FAILED'] as any },
            deliveryWindowStart: start,
            deliveryWindowEnd: end,
          },
        });
        slots.push({
          id: `${start.toISOString()}_${end.toISOString()}`,
          label: template.label,
          windowStart: start.toISOString(),
          windowEnd: end.toISOString(),
          remainingCapacity: Math.max(0, PREORDER_SLOT_CAPACITY - reserved),
          available: reserved < PREORDER_SLOT_CAPACITY,
        });
      }
    }
    return {
      timezone,
      store: {
        id: resolved.store.id,
        name: resolved.store.name,
        operatingHours: resolved.store.operatingHours ?? null,
        timezone,
      },
      storeOpen: openNow,
      nextOpenAt: nextOpen ? nextOpen.toISOString() : null,
      minimumLeadMinutes: PREORDER_MIN_LEAD_MINUTES,
      horizonDays: PREORDER_HORIZON_DAYS,
      slots,
    };
  }
}
