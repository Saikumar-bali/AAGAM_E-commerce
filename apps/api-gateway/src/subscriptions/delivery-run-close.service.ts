/**
 * Run completion and cash accountability.
 *
 * Split out of the former delivery-run-operations.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DeliveryRunStatus, DeliveryRunStopStatus, Prisma, prisma } from '@aagam/database';
import { RunVersionDto } from './subscriptions.dto';
import { isOneOf } from '../common/enum-membership';
import { DeliveryRunOperationsServiceBase, Actor } from './delivery-run-operations.service.base';

export class DeliveryRunCloseService extends DeliveryRunOperationsServiceBase {
  async finish(runId: string, dto: RunVersionDto, actor: Actor) {
    const { rider } = await this.ownedRun(runId, actor);
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`delivery-run-finish:${runId}`}))`);
      const run = await tx.deliveryRun.findUnique({ where: { id: runId }, include: { stops: true } });
      if (!run || run.riderId !== rider.id) throw new NotFoundException('Assigned delivery run not found');
      if (isOneOf(run.status, [DeliveryRunStatus.COMPLETED, DeliveryRunStatus.AWAITING_SETTLEMENT])) {
        return run;
      }
      if (run.version !== dto.version) throw new ConflictException('Delivery run changed; refresh and try again');
      const unresolved = run.stops.filter((stop) => isOneOf(stop.status, [
        DeliveryRunStopStatus.PLANNED,
        DeliveryRunStopStatus.READY,
        DeliveryRunStopStatus.ARRIVED,
        DeliveryRunStopStatus.RETRY_PENDING,
        DeliveryRunStopStatus.RETURN_REQUIRED,
      ]));
      if (unresolved.length) {
        throw new BadRequestException(`${unresolved.length} stop(s) still require delivery, retry, or return resolution`);
      }
      const held = await tx.codLedger.aggregate({
        where: { riderId: rider.id, riderHoldingBalancePaise: { gt: 0 }, deliveryJob: { deliveryRunStop: { deliveryRunId: runId } } },
        _sum: { riderHoldingBalancePaise: true },
      });
      const heldPaise = held._sum.riderHoldingBalancePaise ?? 0;
      const status = heldPaise > 0 ? DeliveryRunStatus.AWAITING_SETTLEMENT : DeliveryRunStatus.COMPLETED;
      const updated = await tx.deliveryRun.update({
        where: { id: run.id },
        data: { status, completedAt: new Date(), version: { increment: 1 } },
      });
      if (status === DeliveryRunStatus.COMPLETED) {
        await tx.riderProfile.update({ where: { id: rider.id }, data: { status: 'ONLINE' } });
      }
      return { ...updated, riderCashHoldingPaise: heldPaise };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async cashAccountability(runId: string, actor: Actor) {
    const { rider, run } = await this.ownedRun(runId, actor);
    const ledgers = await prisma.codLedger.findMany({
      where: { riderId: rider.id, deliveryJob: { deliveryRunStop: { deliveryRunId: run.id } } },
      include: { order: { select: { id: true, subscriptionDeliveryId: true } }, entries: { orderBy: { createdAt: 'asc' } } },
      orderBy: { collectionTimestamp: 'asc' },
    });
    return {
      runId: run.id,
      routeCode: run.routeCode,
      expectedCashPaise: ledgers.reduce((sum, ledger) => sum + ledger.expectedAmountPaise, 0),
      collectedCashPaise: ledgers.reduce((sum, ledger) => sum + ledger.collectedAmountPaise, 0),
      depositedCashPaise: ledgers.reduce((sum, ledger) => sum + ledger.depositedAmountPaise, 0),
      riderHoldingPaise: ledgers.reduce((sum, ledger) => sum + ledger.riderHoldingBalancePaise, 0),
      ledgers,
    };
  }
}
