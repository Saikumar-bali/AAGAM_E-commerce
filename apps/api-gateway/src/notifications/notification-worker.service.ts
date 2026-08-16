import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { DeliveryJobStatus, prisma } from '@aagam/database';
import { AutoDispatchService } from '../orders/auto-dispatch.service';
import {
  failureRiderReleaseAfterMs,
  reconcileRiderOperationalStatus,
} from '../riders/rider-operational-status';
import { NotificationService } from './notification.service';
import { OutboxService } from './outbox.service';

export type NotificationBatchResult = {
  claimed: number;
  processed: number;
  failed: number;
  skipped: boolean;
  expiredAssignments: number;
  backfilledExpiryEvents: number;
  releasedBusyRiders: number;
};

@Injectable()
export class NotificationWorkerService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(NotificationWorkerService.name);
  private autoDispatch?: AutoDispatchService;

  constructor(
    private readonly outbox: OutboxService,
    private readonly notifications: NotificationService,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  onModuleInit() {
    try {
      this.autoDispatch = this.moduleRef?.get(AutoDispatchService, { strict: false });
    } catch (error) {
      this.autoDispatch = undefined;
      this.logger.warn(
        `Auto-dispatch provider is unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (
      process.env.NODE_ENV === 'test' ||
      process.env.NOTIFICATION_WORKER_DISABLED === 'true'
    ) {
      return;
    }

    const intervalMs = Math.max(
      2_000,
      Number(process.env.NOTIFICATION_WORKER_INTERVAL_MS || 10_000),
    );
    this.timer = setInterval(() => {
      void this.processBatch().catch((error) => {
        this.logger.error(
          `Batch failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    }, intervalMs);
    this.timer.unref?.();

    void this.processBatch().catch((error) => {
      this.logger.error(
        `Initial batch failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
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
            expiresAt:
              assignment.expiresAt?.toISOString?.() ||
              assignment.expiresAt ||
              null,
          },
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') return null;
      throw error;
    }
  }

  private async reconcileBusyRiderStatuses(limit = 50) {
    const cutoff = new Date(Date.now() - failureRiderReleaseAfterMs());
    const staleJobs = await prisma.deliveryJob.findMany({
      where: {
        status: DeliveryJobStatus.DELIVERY_FAILED,
        currentRider: { status: 'BUSY' },
        failureDecisions: {
          some: { status: 'DECIDED', appliedAt: null, createdAt: { lt: cutoff } },
        },
      },
      select: { currentRiderId: true },
      distinct: ['currentRiderId'],
      take: Math.max(1, Math.min(100, limit)),
    });
    let released = 0;
    for (const { currentRiderId } of staleJobs) {
      if (!currentRiderId) continue;
      const next = await reconcileRiderOperationalStatus(prisma, currentRiderId);
      if (next === 'ONLINE') released += 1;
    }
    return released;
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
        where: {
          id: assignment.id,
          status: 'OFFERED',
          expiresAt: { lt: now },
        },
        data: { status: 'EXPIRED', respondedAt: now },
      });
      if (changed.count === 1) {
        expiredNow += 1;
        await this.createExpiryEvent(assignment, 'NOTIFICATION_WORKER');

        if (this.autoDispatch) {
          const job = await prisma.deliveryJob.findUnique({
            where: { id: assignment.deliveryJobId },
            select: { status: true },
          });
          if (job?.status === 'WAITING_FOR_DISPATCH') {
            await this.autoDispatch
              .dispatchNearestRider(assignment.deliveryJobId)
              .catch((error) => {
                this.logger.warn(
                  `Auto-dispatch after expiry failed for job ${
                    assignment.deliveryJobId
                  }: ${
                    error instanceof Error ? error.message : String(error)
                  }`,
                );
              });
          }
        }
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
      const event = await this.createExpiryEvent(
        assignment,
        'EXPIRY_EVENT_BACKFILL',
      );
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
        releasedBusyRiders: 0,
      };
    }

    this.running = true;
    let processed = 0;
    let failed = 0;

    try {
      const expiry = await this.reconcileExpiredAssignments(
        Math.max(limit, 20),
      );

      // This sweep is the recovery path for jobs that had no Rider when they
      // were packed, jobs returned to dispatch after a failure resolution, and
      // jobs whose earlier Riders become retryable after the cooldown.
      if (this.autoDispatch) {
        await this.autoDispatch.dispatchWaitingJobs().catch((error) => {
          this.logger.warn(
            `Waiting-job auto-dispatch sweep failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
      }

      // Release Riders pinned BUSY by DELIVERY_FAILED jobs whose resolution
      // decisions went stale without action. Without this sweep such a Rider
      // stays unactionable in the app (switch disabled, no retryable job) and
      // never returns to dispatch rotation.
      let releasedBusyRiders = 0;
      if (this.autoDispatch) {
        releasedBusyRiders = await this.reconcileBusyRiderStatuses().catch(
          (error) => {
            this.logger.warn(
              `Busy Rider reconcile sweep failed: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
            return 0;
          },
        );
      }

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
        releasedBusyRiders: releasedBusyRiders,
      };
    } finally {
      this.running = false;
    }
  }
}
