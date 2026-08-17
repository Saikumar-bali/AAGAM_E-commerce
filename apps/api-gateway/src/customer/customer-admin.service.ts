import { Injectable } from '@nestjs/common';
import { prisma, Role } from '@aagam/database';

@Injectable()
export class CustomerAdminService {
  async listCustomers() {
    return prisma.user.findMany({
      where: { role: Role.CUSTOMER },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        avatarUrl: true,
        emailVerified: true,
        role: true,
        isActive: true,
        deactivatedAt: true,
        deactivationReason: true,
        createdAt: true,
        updatedAt: true,
        addresses: {
          orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
          select: {
            id: true,
            label: true,
            recipientName: true,
            phoneE164: true,
            alternatePhoneE164: true,
            line1: true,
            line2: true,
            landmark: true,
            city: true,
            state: true,
            pincode: true,
            country: true,
            latitude: true,
            longitude: true,
            instructions: true,
            isDefault: true,
            deliveryZoneId: true,
            zoneResolvedAt: true,
            zoneResolutionSource: true,
            zoneResolutionConfidence: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        _count: {
          select: {
            orders: true,
            customerSubscriptions: true,
          },
        },
      },
    });
  }
}
