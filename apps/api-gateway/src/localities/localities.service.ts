import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, prisma } from '@aagam/database';

import { GeoService } from '../geo/geo.service';
import { CreateServiceableLocalityDto } from './dto/create-locality.dto';
import { UpdateServiceableLocalityDto } from './dto/update-locality.dto';

export function normalizePincode(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D+/g, '');
}

export function normalizeAliases(aliases: string[] | undefined): string[] {
  return (aliases ?? []).map((alias) => String(alias).trim()).filter(Boolean);
}

const STRING_PREFIX_RE = /^string:(.*)/i;

function sanitizeLocality<T extends { state?: string; city?: string; name?: string; pincode?: string }>(
  row: T,
): T {
  if (row.state && STRING_PREFIX_RE.test(row.state)) {
    row.state = row.state.replace(STRING_PREFIX_RE, '$1');
  }
  if (row.city && STRING_PREFIX_RE.test(row.city)) {
    row.city = row.city.replace(STRING_PREFIX_RE, '$1');
  }
  if (row.name && STRING_PREFIX_RE.test(row.name)) {
    row.name = row.name.replace(STRING_PREFIX_RE, '$1');
  }
  if (row.pincode && STRING_PREFIX_RE.test(row.pincode)) {
    row.pincode = row.pincode.replace(STRING_PREFIX_RE, '$1');
  }
  return row;
}

@Injectable()
export class LocalitiesService {
  constructor(private readonly geo: GeoService) {}

  async listActive(params: { pincode?: string; city?: string; q?: string }) {
    const where: Prisma.ServiceableLocalityWhereInput = { isActive: true };
    const pincode = normalizePincode(params.pincode);
    if (pincode) where.pincode = pincode;
    if (params.city?.trim()) where.city = params.city.trim();
    const q = params.q?.trim();
    if (q) {
      const token = q.toLocaleLowerCase();
      where.OR = [
        { name: { contains: token, mode: 'insensitive' } },
        { aliases: { has: token } },
        { city: { contains: token, mode: 'insensitive' } },
        { pincode: { contains: token } },
      ];
    }
    const rows = await prisma.serviceableLocality.findMany({
      where,
      orderBy: [{ city: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map(sanitizeLocality);
  }

  async listAll(params: { city?: string }) {
    const rows = await prisma.serviceableLocality.findMany({
      where: params.city?.trim() ? { city: params.city.trim() } : {},
      orderBy: [{ city: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map(sanitizeLocality);
  }

  async create(input: CreateServiceableLocalityDto) {
    const pincode = normalizePincode(input.pincode);
    if (pincode.length !== 6) throw new BadRequestException('Pincode must be a 6-digit number');

    const zoneId = input.zoneId || null;
    await this.assertZone(zoneId);

    const name = input.name.trim();
    const city = input.city.trim();
    const state = input.state?.trim() || 'ANDHRA PRADESH';
    const aliases = normalizeAliases(input.aliases);

    const { latitude, longitude } = await this.resolveCoordinates({ name, city, state, pincode }, input.latitude, input.longitude);

    try {
      return await prisma.serviceableLocality.create({
        data: {
          name,
          aliases,
          city,
          state,
          pincode,
          latitude,
          longitude,
          radius: input.radius ?? null,
          zoneId,
          isActive: input.isActive ?? true,
          sortOrder: input.sortOrder ?? 0,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new BadRequestException(`A locality named "${name}" already exists for pincode ${pincode}`);
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateServiceableLocalityDto) {
    const existing = await prisma.serviceableLocality.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Locality not found');

    const pincode = input.pincode === undefined ? existing.pincode : normalizePincode(input.pincode);
    if (pincode.length !== 6) throw new BadRequestException('Pincode must be a 6-digit number');

    const name = input.name?.trim() ?? existing.name;
    const city = input.city?.trim() ?? existing.city;
    const state = input.state?.trim() ?? existing.state;
    const aliases = input.aliases !== undefined ? normalizeAliases(input.aliases) : existing.aliases;

    const zoneId = input.zoneId === undefined ? existing.zoneId : input.zoneId || null;
    await this.assertZone(zoneId);

    let latitude = input.latitude === undefined ? existing.latitude : input.latitude;
    let longitude = input.longitude === undefined ? existing.longitude : input.longitude;
    const textChanged = (input.name !== undefined || input.city !== undefined || input.state !== undefined || input.pincode !== undefined);
    if (textChanged && (latitude == null || longitude == null)) {
      const resolved = await this.resolveCoordinates({ name, city, state, pincode }, latitude ?? undefined, longitude ?? undefined);
      latitude = resolved.latitude;
      longitude = resolved.longitude;
    }

    try {
      return await prisma.serviceableLocality.update({
        where: { id },
        data: {
          name,
          aliases,
          city,
          state,
          pincode,
          latitude,
          longitude,
          radius: input.radius === undefined ? existing.radius : input.radius ?? null,
          zoneId,
          isActive: input.isActive,
          sortOrder: input.sortOrder,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new BadRequestException(`A locality named "${name}" already exists for pincode ${pincode}`);
      }
      throw error;
    }
  }

  async remove(id: string) {
    const existing = await prisma.serviceableLocality.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Locality not found');
    await prisma.serviceableLocality.delete({ where: { id } });
    return { id, deleted: true };
  }

  private async assertZone(zoneId: string | null) {
    if (!zoneId) return;
    const zone = await prisma.deliveryZone.findFirst({
      where: { id: zoneId, isActive: true },
      select: { id: true },
    });
    if (!zone) throw new BadRequestException('Delivery zone not found or inactive');
  }

  async resolveCoordinates(
    address: { name: string; city: string; state: string; pincode: string },
    explicitLatitude?: number,
    explicitLongitude?: number,
  ) {
    if (explicitLatitude != null && explicitLongitude != null) {
      return { latitude: Number(explicitLatitude), longitude: Number(explicitLongitude) };
    }
    const geocoded = await this.geo.forward({
      line1: address.name,
      landmark: null,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      country: 'IN',
    });
    if (geocoded.ok) {
      return { latitude: geocoded.latitude, longitude: geocoded.longitude };
    }
    return { latitude: null, longitude: null };
  }
}