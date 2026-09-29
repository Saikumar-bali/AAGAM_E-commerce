/**
 * Rider run day listing and detail.
 *
 * Split out of the former delivery-run-operations.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { DeliveryRunStatus, prisma } from '@aagam/database';
import { startOfUtcDay } from './subscription-calendar.service';
import { DeliveryRunOperationsServiceBase, Actor } from './delivery-run-operations.service.base';

export class DeliveryRunReadService extends DeliveryRunOperationsServiceBase {
  async today(actor: Actor, date?: string) {
    const rider = await this.rider(actor);
    const day = startOfUtcDay(date || new Date());
    const next = new Date(day.getTime() + 86_400_000);
    return prisma.deliveryRun.findMany({
      where: { riderId: rider.id, serviceDate: { gte: day, lt: next }, status: { not: DeliveryRunStatus.CANCELLED } },
      orderBy: { slotStart: 'asc' },
      include: {
        store: { select: { id: true, name: true, address: true, latitude: true, longitude: true } },
        deliveryZone: true,
        _count: { select: { stops: true } },
      },
    });
  }

  async details(runId: string, actor: Actor) {
    const { run } = await this.ownedRun(runId, actor);
    return run;
  }
}
