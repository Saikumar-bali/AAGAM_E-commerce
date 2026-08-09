import { Injectable, NotFoundException } from '@nestjs/common';
import { Role, prisma } from '@aagam/database';
import {
  isLegacyNotificationVisibleToRole,
  scopeNotificationInboxForActor,
} from './notification-inbox-audience';
import { NotificationService } from './notification.service';

type PartnerActor = { id: string; role: Role };

@Injectable()
export class PartnerNotificationInboxService {
  constructor(private readonly notifications: NotificationService) {}

  async listInbox(actor: PartnerActor, limitInput?: string | number) {
    const limit = Math.min(100, Math.max(1, Number(limitInput || 50)));
    const notificationInternals = this.notifications as any;

    // New durable rows are addressed by the exact role selected by the router.
    // A CUSTOMER+RIDER or CUSTOMER+STORE_OWNER identity therefore cannot inherit
    // the other workspace's NotificationRecipient rows.
    const recipients = await prisma.notificationRecipient.findMany({
      where: { userId: actor.id, recipientRole: actor.role },
      include: { notification: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const dedicatedItems = recipients.map((recipient) => (
      notificationInternals.toDedicatedInboxItem(recipient)
    ));
    const migratedLegacyIds = new Set(
      recipients
        .map((recipient) => (recipient.notification.data as any)?.legacySourceHistoryId)
        .filter(Boolean),
    );

    const remaining = Math.max(0, limit - dedicatedItems.length);
    const legacyItems: any[] = [];
    if (remaining > 0) {
      const pageSize = Math.max(20, Math.min(100, remaining * 2));
      let skip = 0;
      while (legacyItems.length < remaining) {
        const page = await this.legacyPage(actor, skip, pageSize);
        if (page.length === 0) break;
        skip += page.length;

        for (const row of page) {
          if (migratedLegacyIds.has(row.id)) continue;
          const item = notificationInternals.toLegacyInboxItem(row, actor);
          if (!isLegacyNotificationVisibleToRole(item, actor.role)) continue;
          legacyItems.push(item);
          if (legacyItems.length >= remaining) break;
        }
        if (page.length < pageSize) break;
      }
    }

    const candidates = [...dedicatedItems, ...legacyItems]
      .sort((left, right) => (
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      ));
    const scoped = scopeNotificationInboxForActor({
      items: candidates,
      unreadCount: candidates.filter((item) => !item.readAt).length,
      source: legacyItems.length > 0 ? 'DEDICATED_WITH_LEGACY_FALLBACK' : 'DEDICATED',
    }, actor.role);
    const items = scoped.items.slice(0, limit);

    return {
      ...scoped,
      items,
      unreadCount: items.filter((item) => !item.readAt).length,
    };
  }

  async markRead(actor: PartnerActor, notificationOrSourceId: string) {
    const recipient = await prisma.notificationRecipient.findFirst({
      where: {
        id: notificationOrSourceId,
        userId: actor.id,
        recipientRole: actor.role,
      },
      select: { id: true },
    });
    if (recipient) return this.notifications.markRead(actor, recipient.id);

    const legacy = await this.findLegacyRow(actor, notificationOrSourceId);
    if (!legacy) throw new NotFoundException('Notification not found');
    const internals = this.notifications as any;
    const item = internals.toLegacyInboxItem(legacy, actor);
    if (!isLegacyNotificationVisibleToRole(item, actor.role)) {
      throw new NotFoundException('Notification not found');
    }
    const migrated = await internals.migrateLegacyRow(actor, legacy, true);
    return { ok: true, readAt: migrated.readAt, recipientId: migrated.id };
  }

  async markOpened(actor: PartnerActor, recipientId: string) {
    const recipient = await prisma.notificationRecipient.findFirst({
      where: {
        id: recipientId,
        userId: actor.id,
        recipientRole: actor.role,
      },
      select: { id: true },
    });
    if (!recipient) throw new NotFoundException('Notification not found');
    return this.notifications.markOpened(actor, recipient.id);
  }

  private baseLegacyWhere(actor: PartnerActor) {
    const base: any = {
      note: { notIn: ['Notification marked read.'] },
      createdAt: { lte: new Date() },
    };
    if (actor.role === Role.STORE_OWNER) {
      return { ...base, order: { is: { store: { is: { ownerId: actor.id } } } } };
    }
    return null;
  }

  private async riderProfileId(actor: PartnerActor) {
    if (actor.role !== Role.RIDER) return null;
    const rider = await prisma.riderProfile.findUnique({
      where: { userId: actor.id },
      select: { id: true },
    });
    return rider?.id || null;
  }

  private async legacyPage(actor: PartnerActor, skip: number, take: number) {
    let where = this.baseLegacyWhere(actor);
    if (actor.role === Role.RIDER) {
      const riderId = await this.riderProfileId(actor);
      if (!riderId) return [] as any[];
      where = {
        note: { notIn: ['Notification marked read.'] },
        createdAt: { lte: new Date() },
        order: { is: { riderId } },
      };
    }
    if (!where) return [] as any[];

    return prisma.orderStatusHistory.findMany({
      where,
      include: {
        order: {
          include: {
            store: { select: { name: true } },
            customer: { select: { name: true, phone: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take,
    });
  }

  private async findLegacyRow(actor: PartnerActor, sourceId: string) {
    let where = this.baseLegacyWhere(actor);
    if (actor.role === Role.RIDER) {
      const riderId = await this.riderProfileId(actor);
      if (!riderId) return null;
      where = {
        note: { notIn: ['Notification marked read.'] },
        order: { is: { riderId } },
      };
    }
    if (!where) return null;

    return prisma.orderStatusHistory.findFirst({
      where: { ...where, id: sourceId },
      include: {
        order: {
          include: {
            store: { select: { name: true } },
            customer: { select: { name: true, phone: true } },
          },
        },
      },
    });
  }
}
