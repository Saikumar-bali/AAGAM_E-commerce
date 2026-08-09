import { Injectable } from '@nestjs/common';
import { Role, prisma } from '@aagam/database';
import { scopeNotificationInboxForActor } from './notification-inbox-audience';
import { NotificationService } from './notification.service';

type PartnerActor = { id: string; role: Role };

const INTERNAL_CANDIDATE_LIMIT = 500;

/**
 * Partner identities can carry multiple active role memberships while the
 * NotificationRecipient migration-era table is addressed only by userId.
 * Collect a wider candidate set first, apply the active workspace audience,
 * and only then enforce the public page size.
 */
@Injectable()
export class PartnerNotificationInboxService {
  constructor(private readonly notifications: NotificationService) {}

  async listInbox(actor: PartnerActor, limitInput?: string | number) {
    const limit = Math.min(100, Math.max(1, Number(limitInput || 50)));
    const notificationInternals = this.notifications as any;

    const recipients = await prisma.notificationRecipient.findMany({
      where: { userId: actor.id },
      include: { notification: true },
      orderBy: { createdAt: 'desc' },
      take: INTERNAL_CANDIDATE_LIMIT,
    });
    const migratedLegacyIds = new Set(
      recipients
        .map((recipient) => (recipient.notification.data as any)?.legacySourceHistoryId)
        .filter(Boolean),
    );
    const dedicatedItems = recipients.map((recipient) => (
      notificationInternals.toDedicatedInboxItem(recipient)
    ));

    const legacyRows = await notificationInternals.legacySourceRows(
      actor,
      INTERNAL_CANDIDATE_LIMIT,
    );
    const legacyItems = legacyRows
      .filter((row: any) => !migratedLegacyIds.has(row.id))
      .map((row: any) => notificationInternals.toLegacyInboxItem(row, actor));

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
}
