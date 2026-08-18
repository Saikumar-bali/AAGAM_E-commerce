import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@aagam/database';

import { GeoService } from '../geo/geo.service';
import {
  AddressLocationEvidence,
  AddressLocationSource,
  attachAddressLocationEvidence,
  readAddressLocationEvidence,
  upsertAddressLocationEvidence,
} from './address-location-evidence';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

function normalizePhoneE164(input: string): string {
  const raw = String(input || '').trim();
  if (/^\d{10}$/.test(raw)) {
    return `+91${raw}`;
  }
  if (raw.startsWith('+')) {
    return raw;
  }
  return `+${raw}`;
}

type AddressLocationInput = {
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  pincode: string;
  country?: string | null;
  latitude?: number;
  longitude?: number;
  locationSource?: 'LIVE_GPS' | 'MAP_PIN' | 'GEOCODED';
  locationAccuracyMetres?: number;
  locationCapturedAt?: string;
};

type ResolvedAddressLocation = {
  latitude: number;
  longitude: number;
  evidence: AddressLocationEvidence;
};

@Injectable()
export class CustomerService {
  constructor(private readonly geo: GeoService) {}

  private assertCoordinatePair(latitude?: number, longitude?: number) {
    if ((latitude == null) !== (longitude == null)) {
      throw new BadRequestException('Latitude and longitude must be provided together');
    }
  }

  private verifiedCoordinates(input: AddressLocationInput, source: 'LIVE_GPS' | 'MAP_PIN'): ResolvedAddressLocation {
    this.assertCoordinatePair(input.latitude, input.longitude);
    if (input.latitude == null || input.longitude == null) {
      throw new BadRequestException(`${source === 'LIVE_GPS' ? 'Live GPS' : 'Map pin'} coordinates are required`);
    }
    if (source === 'LIVE_GPS') {
      if (
        typeof input.locationAccuracyMetres !== 'number'
        || !Number.isFinite(input.locationAccuracyMetres)
        || input.locationAccuracyMetres <= 0
      ) {
        throw new BadRequestException('GPS accuracy is required for a live-location address');
      }
      if (!input.locationCapturedAt || !Number.isFinite(new Date(input.locationCapturedAt).getTime())) {
        throw new BadRequestException('A valid GPS capture timestamp is required for a live-location address');
      }
    }
    return {
      latitude: Number(input.latitude),
      longitude: Number(input.longitude),
      evidence: {
        source,
        accuracyMetres: source === 'LIVE_GPS' ? input.locationAccuracyMetres! : null,
        capturedAt: source === 'LIVE_GPS' ? new Date(input.locationCapturedAt!) : null,
      },
    };
  }

  private async geocodedCoordinates(input: AddressLocationInput): Promise<ResolvedAddressLocation> {
    const geocoded = await this.geo.forward({
      line1: input.line1,
      line2: input.line2,
      landmark: input.landmark,
      city: input.city,
      state: input.state,
      pincode: input.pincode,
      country: input.country,
    });
    if (!geocoded.ok) {
      throw new BadRequestException(
        'We could not place this manual address on the delivery map. Use current location or pin the delivery point on the map.',
      );
    }
    return {
      latitude: geocoded.latitude,
      longitude: geocoded.longitude,
      evidence: { source: 'GEOCODED', accuracyMetres: null, capturedAt: null },
    };
  }

  private async resolveNewLocation(input: AddressLocationInput): Promise<ResolvedAddressLocation> {
    this.assertCoordinatePair(input.latitude, input.longitude);
    if (input.locationSource === 'LIVE_GPS' || input.locationSource === 'MAP_PIN') {
      return this.verifiedCoordinates(input, input.locationSource);
    }
    if (input.locationSource === 'GEOCODED' || (input.latitude == null && input.longitude == null)) {
      return this.geocodedCoordinates(input);
    }
    return {
      latitude: Number(input.latitude),
      longitude: Number(input.longitude),
      evidence: { source: 'LEGACY_UNKNOWN', accuracyMetres: null, capturedAt: null },
    };
  }

  private addressTextChanged(dto: UpdateAddressDto) {
    return ['line1', 'line2', 'landmark', 'city', 'state', 'pincode', 'country']
      .some((key) => Object.prototype.hasOwnProperty.call(dto, key));
  }

  private async resolveUpdatedLocation(existing: any, dto: UpdateAddressDto): Promise<ResolvedAddressLocation> {
    const evidence = await readAddressLocationEvidence(prisma, existing.id);
    const merged: AddressLocationInput = {
      line1: dto.line1 ?? existing.line1,
      line2: dto.line2 === undefined ? existing.line2 : dto.line2,
      landmark: dto.landmark === undefined ? existing.landmark : dto.landmark,
      city: dto.city ?? existing.city,
      state: dto.state ?? existing.state,
      pincode: dto.pincode ?? existing.pincode,
      country: dto.country ?? existing.country,
      latitude: dto.latitude,
      longitude: dto.longitude,
      locationSource: dto.locationSource,
      locationAccuracyMetres: dto.locationAccuracyMetres,
      locationCapturedAt: dto.locationCapturedAt,
    };

    const coordinatesTouched = dto.latitude !== undefined || dto.longitude !== undefined;
    if (dto.locationSource) {
      return this.resolveNewLocation(merged);
    }
    if (coordinatesTouched) {
      this.assertCoordinatePair(dto.latitude, dto.longitude);
      if (dto.latitude == null || dto.longitude == null) {
        throw new BadRequestException('Latitude and longitude must be provided together');
      }
      return {
        latitude: Number(dto.latitude),
        longitude: Number(dto.longitude),
        evidence: { source: 'LEGACY_UNKNOWN', accuracyMetres: null, capturedAt: null },
      };
    }
    if (evidence.source === 'GEOCODED' && this.addressTextChanged(dto)) {
      return this.geocodedCoordinates(merged);
    }
    return {
      latitude: existing.latitude,
      longitude: existing.longitude,
      evidence,
    };
  }

  async listAddresses(userId: string) {
    const addresses = await prisma.customerAddress.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
    return Promise.all(addresses.map((address) => attachAddressLocationEvidence(prisma, address)));
  }

  async createAddress(userId: string, dto: CreateAddressDto) {
    const country = (dto.country || 'IN').toUpperCase();
    const phoneE164 = normalizePhoneE164(dto.phoneE164);
    const alternatePhoneE164 = dto.alternatePhoneE164 ? normalizePhoneE164(dto.alternatePhoneE164) : null;

    if (country !== 'IN') {
      throw new BadRequestException('Only IN addresses are supported currently');
    }
    const location = await this.resolveNewLocation({ ...dto, country });

    return prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.customerAddress.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const created = await tx.customerAddress.create({
        data: {
          userId,
          label: dto.label,
          recipientName: dto.recipientName,
          phoneE164,
          alternatePhoneE164,
          line1: dto.line1,
          line2: dto.line2,
          landmark: dto.landmark,
          city: dto.city,
          state: dto.state,
          pincode: dto.pincode,
          country,
          latitude: location.latitude,
          longitude: location.longitude,
          instructions: dto.instructions,
          isDefault: Boolean(dto.isDefault),
        },
      });
      await upsertAddressLocationEvidence(tx, created.id, location.evidence);
      return {
        ...created,
        locationSource: location.evidence.source as AddressLocationSource,
        locationAccuracyMetres: location.evidence.accuracyMetres,
        locationCapturedAt: location.evidence.capturedAt?.toISOString() ?? null,
      };
    });
  }

  async updateAddress(userId: string, addressId: string, dto: UpdateAddressDto) {
    const existing = await prisma.customerAddress.findUnique({ where: { id: addressId } });
    if (!existing) throw new NotFoundException('Address not found');
    if (existing.userId !== userId) throw new ForbiddenException('Not allowed');

    const country = dto.country ? dto.country.toUpperCase() : undefined;
    if (country && country !== 'IN') {
      throw new BadRequestException('Only IN addresses are supported currently');
    }

    const phoneE164 = dto.phoneE164 ? normalizePhoneE164(dto.phoneE164) : undefined;
    const alternatePhoneE164 = dto.alternatePhoneE164
      ? normalizePhoneE164(dto.alternatePhoneE164)
      : dto.alternatePhoneE164 === '' || dto.alternatePhoneE164 === null
        ? null
        : undefined;
    const location = await this.resolveUpdatedLocation(existing, { ...dto, ...(country ? { country } : {}) });

    return prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.customerAddress.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const updated = await tx.customerAddress.update({
        where: { id: addressId },
        data: {
          label: dto.label,
          recipientName: dto.recipientName,
          phoneE164,
          alternatePhoneE164,
          line1: dto.line1,
          line2: dto.line2,
          landmark: dto.landmark,
          city: dto.city,
          state: dto.state,
          pincode: dto.pincode,
          country,
          latitude: location.latitude,
          longitude: location.longitude,
          instructions: dto.instructions,
          isDefault: dto.isDefault,
        },
      });
      await upsertAddressLocationEvidence(tx, addressId, location.evidence);
      return {
        ...updated,
        locationSource: location.evidence.source as AddressLocationSource,
        locationAccuracyMetres: location.evidence.accuracyMetres,
        locationCapturedAt: location.evidence.capturedAt?.toISOString() ?? null,
      };
    });
  }

  async deleteAddress(userId: string, addressId: string) {
    const existing = await prisma.customerAddress.findUnique({ where: { id: addressId } });
    if (!existing) throw new NotFoundException('Address not found');
    if (existing.userId !== userId) throw new ForbiddenException('Not allowed');

    if (existing.isDefault) {
      const addressCount = await prisma.customerAddress.count({ where: { userId } });
      if (addressCount === 1) {
        throw new BadRequestException('Cannot delete your only address. Add another address first.');
      }
      throw new BadRequestException('Cannot delete your default address. Please set another address as default first.');
    }

    const subscriptionCount = await prisma.customerSubscription.count({
      where: { addressId, status: { in: ['ACTIVE', 'PAUSED', 'PAYMENT_DUE', 'GRACE_PERIOD'] } },
    });
    if (subscriptionCount > 0) {
      throw new BadRequestException('This address is linked to active subscriptions and cannot be deleted. Cancel or update the subscription first.');
    }

    await prisma.customerAddress.delete({ where: { id: addressId } });
    return { success: true };
  }
}
