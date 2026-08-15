import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DeliveryRunStatus, Role, prisma } from '@aagam/database';
import { enqueueOutboxEvent } from '../notifications/outbox.service';

@Injectable()
export class SubscriptionRiderCapacityNotificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SubscriptionRiderCapacityNotificationService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    const intervalMs = Math.max(60_000, Number(process.env.SUBSCRIPTION_RIDER_CAPACITY_NOTICE_INTERVAL_MS || 5 * 60_000));
    this.timer = setInterval(() => void this.flush(), intervalMs);
    this.timer.unref?.();
    void this.flush();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async flush() {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const finalAssignmentHours = Math.max(1, Math.min(12, Number(process.env.ROUTE_FINAL_ASSIGNMENT_HOURS_BEFORE || 2)));
      const from = new Date(now.getTime() + finalAssignmentHours * 3_600_000);
      const to = new Date(now.getTime() + 36 * 3_600_000);
      const runs = await prisma.deliveryRun.findMany({
        where: {
          riderId: null,
          status: { in: [DeliveryRunStatus.PLANNED, DeliveryRunStatus.RIDER_NEEDED] },
          slotStart: { gt: from, lte: to },
        },
        include: {
          store: { select: { name: true } },
          deliveryZone: { include: { preferredRiderLinks: true } },
        },
        orderBy: { slotStart: 'asc' },
        take: 200,
      });

      for (const run of runs) {
        const candidates = await prisma.riderProfile.findMany({
          where: {
            approvalStatus: 'APPROVED',
            user: { isActive: true },
            shifts: {
              some: {
                startsAt: { lte: run.slotStart },
                endsAt: { gte: run.slotEnd },
                status: { in: ['SCHEDULED', 'ACTIVE'] },
              },
            },
          },
          include: {
            user: { select: { id: true } },
            documents: { where: { status: 'APPROVED' } },
          },
          take: 500,
        });
        const preferred = new Set(run.deliveryZone?.preferredRiderLinks.map((entry) => entry.riderProfileId) || []);
        const allowedVehicles = new Set((run.deliveryZone?.allowedVehicleTypes || []).map((value) => value.toUpperCase()));
        const eligible = candidates.filter((rider) => {
          if (!rider.documents.some((document) => !document.expiresAt || document.expiresAt >= now)) return false;
          if (rider.homeZoneId && run.deliveryZoneId && rider.homeZoneId !== run.deliveryZoneId && !preferred.has(rider.id)) return false;
          if (allowedVehicles.size && (!rider.vehicleType || !allowedVehicles.has(rider.vehicleType.toUpperCase()))) return false;
          if (run.expectedParcelCount > rider.maximumParcelCapacity) return false;
          return true;
        });

        for (const rider of eligible) {
          const id = `subscription-capacity:${run.id}:${rider.user.id}`;
          await enqueueOutboxEvent(prisma, {
            eventType: 'ADMIN_BROADCAST',
            aggregateType: 'SYSTEM',
            aggregateId: run.id,
            idempotencyKey: id,
            payload: {
              title: 'Tomorrow delivery capacity notice',
              body: `${run.store.name} has a ${run.totalStopCount}-stop subscription route in your scheduled shift. This is advance planning, not final assignment; stay available near the slot.`,
              audience: 'TARGETED',
              deepLink: '/rider/runs',
              targetRecipients: [{ userId: rider.user.id, role: Role.RIDER }],
              metadata: {
                kind: 'SUBSCRIPTION_RIDER_CAPACITY_NOTICE',
                deliveryRunId: run.id,
                routeCode: run.routeCode,
                serviceDate: run.serviceDate.toISOString(),
                slotStart: run.slotStart.toISOString(),
                slotEnd: run.slotEnd.toISOString(),
                finalAssignmentHoursBefore: finalAssignmentHours,
                finalAssignmentPending: true,
              },
            },
          });
        }
      }
    } catch (error: unknown) {
      this.logger.error(`Subscription rider capacity notice failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
