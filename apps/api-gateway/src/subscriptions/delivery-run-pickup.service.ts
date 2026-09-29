/**
 * Bag receipt confirmation and run start.
 *
 * Split out of the former delivery-run-operations.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DeliveryRunStatus, Prisma, SubscriptionDeliveryStatus, prisma } from '@aagam/database';
import { DeliveryJobStatus } from '@aagam/types';
import { ConfirmRunPickupReceiptDto, RunVersionDto } from './subscriptions.dto';
import { DeliveryWorkflowService } from '../orders/delivery-workflow.service';
import { DeliveryRunOperationsServiceBase, Actor } from './delivery-run-operations.service.base';

export class DeliveryRunPickupService extends DeliveryRunOperationsServiceBase {
  constructor(private readonly workflow: DeliveryWorkflowService) {
    super();
  }

  async confirmPickupReceipt(runId: string, dto: ConfirmRunPickupReceiptDto, actor: Actor) {
    const { rider } = await this.ownedRun(runId, actor);
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`delivery-run-rider-receipt:${runId}`}))`);
      const run = await tx.deliveryRun.findUnique({
        where: { id: runId },
        include: { stops: { include: { deliveryJob: true } } },
      });
      if (!run || run.riderId !== rider.id) throw new NotFoundException('Assigned delivery run not found');
      if (run.status === DeliveryRunStatus.PICKED_UP && run.pickupConfirmedById === actor.id) return run;
      if (run.version !== dto.version) throw new ConflictException('Delivery run changed; refresh and try again');
      if (run.status !== DeliveryRunStatus.READY_FOR_PICKUP || !run.storeHandoffConfirmedAt) {
        throw new BadRequestException('The store must confirm the physical handoff before rider receipt');
      }
      if (dto.expectedBagCount !== run.expectedBagCount || run.packedBagCount !== run.expectedBagCount) {
        throw new BadRequestException(`Verify exactly ${run.expectedBagCount} route bags before pickup`);
      }
      if (run.crateCode && dto.crateCode?.trim() !== run.crateCode) {
        throw new BadRequestException('Route crate code does not match the packed run');
      }
      for (const stop of run.stops) {
        if (stop.deliveryJob.status === DeliveryJobStatus.RIDER_AT_STORE) {
          await this.workflow.transitionWithinTransaction(
            tx,
            stop.deliveryJobId,
            DeliveryJobStatus.PICKUP_VERIFIED,
            actor,
            {
              expectedStatus: DeliveryJobStatus.RIDER_AT_STORE,
              skipRoleCheck: true,
              metadata: { deliveryRunId: run.id, routeCode: run.routeCode, routeLevelRiderReceipt: true },
            },
          );
        } else if (stop.deliveryJob.status !== DeliveryJobStatus.PICKUP_VERIFIED) {
          throw new ConflictException(`Stop ${stop.sequenceNumber} is not ready for rider receipt`);
        }
      }
      return tx.deliveryRun.update({
        where: { id: run.id },
        data: {
          status: DeliveryRunStatus.PICKED_UP,
          pickupConfirmedAt: new Date(),
          pickupConfirmedById: actor.id,
          version: { increment: 1 },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async start(runId: string, dto: RunVersionDto, actor: Actor) {
    const { rider } = await this.ownedRun(runId, actor);
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`delivery-run-start:${runId}`}))`);
      const run = await tx.deliveryRun.findUnique({ where: { id: runId }, include: { stops: { include: { deliveryJob: true } } } });
      if (!run || run.riderId !== rider.id) throw new NotFoundException('Assigned delivery run not found');
      if (run.version !== dto.version) throw new ConflictException('Delivery run changed; refresh and try again');
      if (run.status === DeliveryRunStatus.IN_PROGRESS) return run;
      if (run.status !== DeliveryRunStatus.PICKED_UP) throw new BadRequestException('Store pickup must be confirmed before starting the run');
      for (const stop of run.stops) {
        if (stop.deliveryJob.status === DeliveryJobStatus.PICKUP_VERIFIED) {
          await this.workflow.transitionWithinTransaction(
            tx,
            stop.deliveryJobId,
            DeliveryJobStatus.OUT_FOR_DELIVERY,
            actor,
            {
              expectedStatus: DeliveryJobStatus.PICKUP_VERIFIED,
              metadata: { deliveryRunId: run.id, routeCode: run.routeCode },
            },
          );
        } else if (stop.deliveryJob.status !== DeliveryJobStatus.OUT_FOR_DELIVERY) {
          throw new ConflictException(`Stop ${stop.sequenceNumber} is not ready to leave the store`);
        }
        await tx.subscriptionDelivery.update({
          where: { id: stop.subscriptionDeliveryId },
          data: { status: SubscriptionDeliveryStatus.OUT_FOR_DELIVERY },
        });
      }
      return tx.deliveryRun.update({
        where: { id: run.id },
        data: { status: DeliveryRunStatus.IN_PROGRESS, startedAt: new Date(), version: { increment: 1 } },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
