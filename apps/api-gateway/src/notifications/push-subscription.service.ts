import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@aagam/database';
import { RegisterPushSubscriptionDto } from '@aagam/types';

@Injectable()
export class PushSubscriptionService {
  async register(userId: string, input: RegisterPushSubscriptionDto) {
    const now = new Date();

    let result: any;

    if (input.token) {
      result = await prisma.pushSubscription.upsert({
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
    } else {
      const existing = await prisma.pushSubscription.findFirst({
        where: { provider: input.provider, endpoint: input.endpoint || null },
      });
      if (existing) {
        result = await prisma.pushSubscription.update({
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
      } else {
        result = await prisma.pushSubscription.create({
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
    }

    await prisma.pushSubscription.updateMany({
      where: {
        userId,
        provider: input.provider,
        isActive: true,
        id: { not: result.id },
      },
      data: { isActive: false, invalidatedAt: now },
    });

    return result;
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
