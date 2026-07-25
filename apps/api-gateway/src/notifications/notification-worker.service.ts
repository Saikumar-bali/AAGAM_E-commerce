import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { prisma } from '@aagam/database';
import { NotificationService } from './notification.service';
import { OutboxService } from './outbox.service';

export type NotificationBatchResult = {
  claimed: number;
  processed: number;
  failed: number;
  skipped: boolean;
  expiredAssignments: number;
  backfilledExpiryEvents: number;
};

@Injectable()
export class NotificationWorkerService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly outbox: OutboxService,
    private readonly notifications: NotificationService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.NOTIFICATION_WORKER_DISABLED === 'true') return;
    const intervalMs = Math.max(2000, Number(process.env.NOTIFICATION_WORKER_INTERVAL_MS || 10000));
    this.timer = setInterval(() => {
      void this.processBatch().catch((error) => {
        console.error('[NotificationWorker] Batch failed:', error);
      });
    }, intervalMs);
    this.timer.unref?.();
    void this.processBatch().catch((error) => {
      console.error('[NotificationWorker] Initial batch failed:', error);
    });
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async createExpiryEvent(assignment: any, source: string) {
    try {
      return await prisma.deliveryEvent.create({
        data: {
          deliveryJobId: assignment.deliveryJobId,
          assignmentId: assignment.id,
          eventType: 'ASSIGNMENT_EXPIRED',
          metadata: {
            source,
            riderProfileId: assignment.riderProfileId,
            expiresAt: assignment.expiresAt?.toISOString?.() || assignment.expiresAt || null,
          },
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') return null;
      throw error;
    }
  }

  private async reconcileExpiredAssignments(limit = 100) {
    const now = new Date();
    let expiredNow = 0;
    let backfilled = 0;

    const overdue = await prisma.dispatchAssignment.findMany({
      where: {
        status: 'OFFERED',
        expiresAt: { lt: now },
      },
      orderBy: { expiresAt: 'asc' },
      take: Math.max(1, Math.min(500, limit)),
    });

    for (const assignment of overdue) {
      const changed = await prisma.dispatchAssignment.updateMany({
        where: { id: assignment.id, status: 'OFFERED', expiresAt: { lt: now } },
        data: { status: 'EXPIRED', respondedAt: now },
      });
      if (changed.count === 1) {
        expiredNow += 1;
        await this.createExpiryEvent(assignment, 'NOTIFICATION_WORKER');
      }
    }

    const missingEvents = await prisma.dispatchAssignment.findMany({
      where: {
        status: 'EXPIRED',
        events: { none: { eventType: 'ASSIGNMENT_EXPIRED' } },
      },
      orderBy: { respondedAt: 'asc' },
      take: Math.max(1, Math.min(500, limit)),
    });

    for (const assignment of missingEvents) {
      const event = await this.createExpiryEvent(assignment, 'EXPIRY_EVENT_BACKFILL');
      if (event) backfilled += 1;
    }

    return { expiredNow, backfilled };
  }

  async processBatch(limit = 20): Promise<NotificationBatchResult> {
    if (this.running) {
      return {
        claimed: 0,
        processed: 0,
        failed: 0,
        skipped: true,
        expiredAssignments: 0,
        backfilledExpiryEvents: 0,
      };
    }
    this.running = true;
    let processed = 0;
    let failed = 0;

    try {
      const expiry = await this.reconcileExpiredAssignments(Math.max(limit, 20));
      const events = await this.outbox.claimBatch(limit);
      for (const event of events) {
        try {
          await this.notifications.processOutboxEvent(event);
          await this.outbox.markProcessed(event.id);
          processed += 1;
        } catch (error) {
          failed += 1;
          await this.outbox.markFailed(event.id, error);
        }
      }
      return {
        claimed: events.length,
        processed,
        failed,
        skipped: false,
        expiredAssignments: expiry.expiredNow,
        backfilledExpiryEvents: expiry.backfilled,
      };
    } finally {
      this.running = false;
    }
  }
}
