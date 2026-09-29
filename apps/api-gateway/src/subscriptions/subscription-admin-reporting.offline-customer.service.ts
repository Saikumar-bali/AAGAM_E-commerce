/**
 * Offline customer registration.
 *
 * Split out of the former subscription-admin-reporting.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, prisma } from '@aagam/database';
import { normalizePhoneE164 } from '../contact-verification/contact-otp.service';

@Injectable()
export class SubscriptionAdminReportingOfflineCustomerService {
  async createOfflineCustomer(
    dto: { name: string; phone: string; line1: string; line2?: string; landmark?: string; city: string; state: string; pincode: string; latitude?: number; longitude?: number; storeId?: string },
    actor?: { id: string; role: Role },
  ) {
    const compactPhone = dto.phone.trim().replace(/[\s().-]/g, '');
    if (!/^\d{10}$/.test(compactPhone)) {
      throw new BadRequestException('Phone number must be exactly 10 digits');
    }

    // Pin the customer to the creating store so the store that owns the
    // relationship can manage the lifecycle even before a subscription exists.
    // Callers resolve `storeId` (admins pick one; stores are bound to the store
    // they own and are verified before this call).
    const storeId = dto.storeId;
    if (!storeId) {
      throw new BadRequestException('storeId is required to register an offline customer');
    }

    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      throw new NotFoundException('Store not found');
    }

    let e164Phone: string | null = null;
    try {
      e164Phone = normalizePhoneE164(dto.phone);
    } catch {
      e164Phone = `+91${compactPhone}`;
    }

    let customer = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: compactPhone },
          ...(e164Phone ? [{ phone: e164Phone }] : []),
          { phone: dto.phone.trim() },
        ],
      },
    });

    if (!customer) {
      const syntheticEmail = `offline.${compactPhone || Date.now()}@aagaam.local`;
      customer = await prisma.user.create({
        data: {
          name: dto.name.trim(),
          phone: compactPhone,
          email: syntheticEmail,
          role: Role.CUSTOMER,
          emailVerified: true,
          acquisitionSource: 'OFFLINE_STORE',
          offlineStoreId: storeId ?? null,
        },
      });
    } else {
      const isOfflineCustomer =
        customer.acquisitionSource === 'OFFLINE_STORE' ||
        customer.acquisitionSource === 'OFFLINE' ||
        (customer.email && customer.email.endsWith('@aagaam.local') && customer.email.startsWith('offline.'));

      if (!isOfflineCustomer) {
        throw new ConflictException('A registered customer with this phone number already exists.');
      }

      if (customer.offlineStoreId && customer.offlineStoreId !== storeId && actor?.role !== Role.ADMIN) {
        throw new ConflictException('This customer is already registered with another store.');
      }

      if (actor && actor.role !== Role.ADMIN) {
        const otherStoreSub = await prisma.customerSubscription.findFirst({
          where: {
            customerId: customer.id,
            homeStore: { ownerId: { not: actor.id } },
          },
          select: { id: true },
        });
        if (otherStoreSub) {
          throw new ConflictException('This customer has subscriptions registered with another store.');
        }
      }

      const patch: Prisma.UserUpdateInput = {};
      if (dto.name.trim() && dto.name.trim() !== (customer.name || '')) {
        // Persist an edited display name so admin edits are not silently dropped.
        patch.name = dto.name.trim();
      }
      if (!customer.offlineStoreId && storeId) {
        patch.offlineStore = { connect: { id: storeId } };
      }
      if (Object.keys(patch).length > 0) {
        customer = await prisma.user.update({ where: { id: customer.id }, data: patch });
      }
    }

    const fallbackLat = typeof dto.latitude === 'number' && Number.isFinite(dto.latitude) ? dto.latitude : 17.6913;
    const fallbackLng = typeof dto.longitude === 'number' && Number.isFinite(dto.longitude) ? dto.longitude : 83.0039;

    // Clear any existing default addresses before creating a new one to avoid
    // multiple defaults on the same customer (which could cause stale prefill).
    await prisma.customerAddress.updateMany({
      where: { userId: customer.id, isDefault: true },
      data: { isDefault: false },
    });

    const address = await prisma.customerAddress.create({
      data: {
        userId: customer.id,
        label: 'Home',
        recipientName: dto.name.trim(),
        phoneE164: compactPhone,
        line1: dto.line1.trim(),
        line2: dto.line2?.trim() || null,
        landmark: dto.landmark?.trim() || null,
        city: dto.city.trim(),
        state: dto.state.trim(),
        pincode: dto.pincode.trim(),
        country: 'IN',
        latitude: fallbackLat,
        longitude: fallbackLng,
        isDefault: true,
      },
    });

    return { customer, address };
  }
}
