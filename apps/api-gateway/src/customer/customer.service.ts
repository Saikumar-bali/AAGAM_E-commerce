import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@aagam/database';

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
  // Allow "+<digits>" or "<digits>" from the DTO pattern.
  return `+${raw}`;
}

@Injectable()
export class CustomerService {
  async listAddresses(userId: string) {
    return prisma.customerAddress.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async createAddress(userId: string, dto: CreateAddressDto) {
    const country = (dto.country || 'IN').toUpperCase();
    const phoneE164 = normalizePhoneE164(dto.phoneE164);
    const alternatePhoneE164 = dto.alternatePhoneE164 ? normalizePhoneE164(dto.alternatePhoneE164) : null;

    if (country !== 'IN') {
      throw new BadRequestException('Only IN addresses are supported currently');
    }

    return prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.customerAddress.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.customerAddress.create({
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
          latitude: dto.latitude,
          longitude: dto.longitude,
          instructions: dto.instructions,
          isDefault: Boolean(dto.isDefault),
        },
      });
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
      : dto.alternatePhoneE164 === ''
        ? null
        : undefined;

    return prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.customerAddress.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.customerAddress.update({
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
          latitude: dto.latitude,
          longitude: dto.longitude,
          instructions: dto.instructions,
          isDefault: dto.isDefault,
        },
      });
    });
  }

  async deleteAddress(userId: string, addressId: string) {
    const existing = await prisma.customerAddress.findUnique({ where: { id: addressId } });
    if (!existing) throw new NotFoundException('Address not found');
    if (existing.userId !== userId) throw new ForbiddenException('Not allowed');

    await prisma.customerAddress.delete({ where: { id: addressId } });
    return { success: true };
  }
}
