import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@aagam/database';
import { RegisterPushSubscriptionDto } from '@aagam/types';

@Injectable()
export class PushSubscriptionService {
  async register(userId: string, input: RegisterPushSubscriptionDto) {
    const now = new Date();

    if (input.token) {
      return prisma.pushSubscription.upsert({
        where: { token: input.token },
        update: {
          userId,
          provider: input.provider,
          endpoint: input.endpoint || null,
          p256dh: input.p256dh || null,
          auth: input.auth || null,
          userAgent: input.userAgent || null,
          deviceName: input.deviceName || null,
          isActive: true,
          invalidatedAt: null,
          lastSeenAt: now,
        },
        create: {
          userId,
          provider: input.provider,
          token: input.token,
          endpoint: input.endpoint || null,
          p256dh: input.p256dh || null,
          auth: input.auth || null,
          userAgent: input.userAgent || null,
          deviceName: input.deviceName || null,
          isActive: true,
          lastSeenAt: now,
        },
      });
    }

    const existing = await prisma.pushSubscription.findFirst({
      where: { provider: input.provider, endpoint: input.endpoint || null },
    });
    if (existing) {
      return prisma.pushSubscription.update({
        where: { id: existing.id },
        data: {
          userId,
          p256dh: input.p256dh || null,
          auth: input.auth || null,
          userAgent: input.userAgent || null,
          deviceName: input.deviceName || null,
          isActive: true,
          invalidatedAt: null,
          lastSeenAt: now,
        },
      });
    }

    return prisma.pushSubscription.create({
      data: {
        userId,
        provider: input.provider,
        endpoint: input.endpoint || null,
        p256dh: input.p256dh || null,
        auth: input.auth || null,
        userAgent: input.userAgent || null,
        deviceName: input.deviceName || null,
        lastSeenAt: now,
      },
    });
  }

  list(userId: string) {
    return prisma.pushSubscription.findMany({
      where: { userId },
      orderBy: [{ isActive: 'desc' }, { lastSeenAt: 'desc' }],
      select: {
        id: true,
        provider: true,
        endpoint: true,
        deviceName: true,
        userAgent: true,
        isActive: true,
        lastSeenAt: true,
        invalidatedAt: true,
        createdAt: true,
      },
    });
  }

  async disable(userId: string, subscriptionId: string) {
    const subscription = await prisma.pushSubscription.findFirst({
      where: { id: subscriptionId, userId },
    });
    if (!subscription) throw new NotFoundException('Push subscription not found');
    return prisma.pushSubscription.update({
      where: { id: subscriptionId },
      data: { isActive: false, invalidatedAt: new Date() },
    });
  }

  disableByToken(token: string) {
    return prisma.pushSubscription.updateMany({
      where: { token },
      data: { isActive: false, invalidatedAt: new Date() },
    });
  }

  activeForUser(userId: string) {
    return prisma.pushSubscription.findMany({
      where: { userId, isActive: true },
      orderBy: { lastSeenAt: 'desc' },
    });
  }
}
