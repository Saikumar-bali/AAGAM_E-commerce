import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { OutboxService } from './outbox.service';

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

  async processBatch(limit = 20) {
    if (this.running) return { claimed: 0, processed: 0, failed: 0, skipped: true };
    this.running = true;
    let processed = 0;
    let failed = 0;

    try {
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
      return { claimed: events.length, processed, failed, skipped: false };
    } finally {
      this.running = false;
    }
  }
}
