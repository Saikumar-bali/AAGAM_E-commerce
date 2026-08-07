import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DeliveryResolutionAction,
  GeofencePhase,
  DeliveryRunStatus,
  DeliveryRunStopStatus,
  PaymentMethod,
  Prisma,
  Role,
  SubscriptionDeliveryMethod,
  SubscriptionDeliveryStatus,
  SubscriptionProofMode,
  prisma,
} from '@aagam/database';
import { DeliveryJobStatus } from '@aagam/types';
import { DeliveryOperationsService } from '../orders/delivery-operations.service';
import { DeliveryWorkflowService } from '../orders/delivery-workflow.service';
import {
  ArriveRunStopDto,
  CompleteRunStopDto,
  ConfirmRunPickupReceiptDto,
  FailRunStopDto,
  ReorderRunStopDto,
  RunVersionDto,
} from './subscriptions.dto';
import { SubscriptionCashFundingService } from './subscription-cash-funding.service';
import { startOfUtcDay } from './subscription-calendar.service';
import { isOneOf } from '../common/enum-membership';
import { TrustedDropService } from './trusted-drop.service';

type Actor = { id: string; role: Role };

@Injectable()
export class DeliveryRunOperationsService {
  constructor(
    private readonly workflow: DeliveryWorkflowService,
    private readonly deliveryOperations: DeliveryOperationsService,
    private readonly funding: SubscriptionCashFundingService,
    private readonly trustedDrop: TrustedDropService,
  ) {}

  private async rider(actor: Actor) {
    if (actor.role !== Role.RIDER) throw new ForbiddenException('Rider role is required');
    const rider = await prisma.riderProfile.findUnique({ where: { userId: actor.id } });
    if (!rider) throw new ForbiddenException('Rider profile not found');
    return rider;
  }

  private async ownedRun(runId: string, actor: Actor) {
    const rider = await this.rider(actor);
    const run = await prisma.deliveryRun.findFirst({
      where: { id: runId, riderId: rider.id },
      include: {
        store: { select: { id: true, name: true, address: true, latitude: true, longitude: true } },
        deliveryZone: true,
        stops: {
          orderBy: { sequenceNumber: 'asc' },
          include: {
            deliveryJob: { include: { order: { include: { customer: { select: { name: true, phone: true } }, payment: true, items: { include: { product: true } } } } } },
            subscriptionDelivery: { include: { subscription: { select: { id: true, customerId: true, addressSnapshot: true, deliveryMethod: true, trustedDropInstructions: true } } } },
          },
        },
      },
    });
    if (!run) throw new NotFoundException('Assigned delivery run not found');
    return { rider, run };
  }

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

  async arrive(runId: string, stopId: string, dto: ArriveRunStopDto, actor: Actor) {
    const { rider } = await this.ownedRun(runId, actor);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`delivery-run-stop-arrive:${stopId}`}))`);
      const stop = await tx.deliveryRunStop.findFirst({
        where: { id: stopId, deliveryRunId: runId, deliveryRun: { riderId: rider.id } },
        include: { deliveryRun: true, deliveryJob: true },
      });
      if (!stop) throw new NotFoundException('Run stop not found');
      if (stop.status === DeliveryRunStopStatus.ARRIVED) return { stop };
      if (stop.version !== dto.version) throw new ConflictException('Run stop changed; refresh and try again');
      if (stop.deliveryRun.status !== DeliveryRunStatus.IN_PROGRESS) throw new BadRequestException('Delivery run is not in progress');
      if (!isOneOf(stop.status, [DeliveryRunStopStatus.READY, DeliveryRunStopStatus.PLANNED, DeliveryRunStopStatus.RETRY_PENDING])) {
        throw new BadRequestException(`Stop cannot be marked arrived from ${stop.status}`);
      }
      if (stop.proofMode === SubscriptionProofMode.TRUSTED_DROP_GEOFENCE_TOKEN_PHOTO) {
        const geofence = await this.trustedDrop.recordGeofence(tx, {
          stopId: stop.id, riderId: rider.id, phase: GeofencePhase.ARRIVAL,
          latitude: dto.latitude, longitude: dto.longitude, accuracyMetres: dto.accuracyMetres,
        });
        if (!geofence.passed) return { rejectedGeofence: geofence.proof };
      }
      if (stop.deliveryJob.status === DeliveryJobStatus.OUT_FOR_DELIVERY) {
        await this.workflow.transitionWithinTransaction(
          tx, stop.deliveryJobId, DeliveryJobStatus.RIDER_AT_CUSTOMER, actor,
          { expectedStatus: DeliveryJobStatus.OUT_FOR_DELIVERY, metadata: { deliveryRunId: runId, deliveryRunStopId: stopId } },
        );
      } else if (stop.deliveryJob.status !== DeliveryJobStatus.RIDER_AT_CUSTOMER) {
        throw new ConflictException('Delivery job is not approaching the customer');
      }
      const updated = await tx.deliveryRunStop.update({
        where: { id: stop.id },
        data: {
          status: DeliveryRunStopStatus.ARRIVED, arrivedAt: new Date(),
          latitude: dto.latitude, longitude: dto.longitude, accuracyMetres: dto.accuracyMetres,
          version: { increment: 1 },
        },
      });
      return { stop: updated };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if ('rejectedGeofence' in result && result.rejectedGeofence) {
      const proof = result.rejectedGeofence;
      throw new BadRequestException(
        proof.decision === 'FAIL_ACCURACY'
          ? `GPS accuracy must be within ${Math.round(proof.allowedRadiusMetres)} metres before Trusted Drop arrival`
          : `Move within ${Math.round(proof.allowedRadiusMetres)} metres of the delivery point before Trusted Drop arrival`,
      );
    }
    return result.stop;
  }

  async issueOtp(runId: string, stopId: string, actor: Actor, idempotencyKey?: string) {
    const { run } = await this.ownedRun(runId, actor);
    const stop = run.stops.find((candidate) => candidate.id === stopId);
    if (!stop) throw new NotFoundException('Run stop not found');
    if (stop.status !== DeliveryRunStopStatus.ARRIVED) throw new BadRequestException('Mark arrival before requesting OTP');
    if (stop.proofMode === SubscriptionProofMode.TRUSTED_DROP_GEOFENCE_TOKEN_PHOTO && stop.cashDuePaise === 0) {
      throw new BadRequestException('Trusted-drop funded stops do not require customer OTP');
    }
    return this.deliveryOperations.issueOtp(stop.deliveryJobId, actor, idempotencyKey);
  }

  private async finalizeDeliveredStopWithinTransaction(
    tx: Prisma.TransactionClient,
    runId: string,
    stopId: string,
    expectedVersion: number,
    collectedCashPaise: number,
    dto: CompleteRunStopDto,
  ) {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`delivery-run-stop-finalize:${stopId}`}))`);
    const current = await tx.deliveryRunStop.findUnique({ where: { id: stopId } });
    if (!current) throw new NotFoundException('Run stop not found');
    if (current.status === DeliveryRunStopStatus.DELIVERED) return;
    if (current.version !== expectedVersion) throw new ConflictException('Run stop changed; refresh and try again');
    await tx.deliveryRunStop.update({
      where: { id: stopId },
      data: {
        status: DeliveryRunStopStatus.DELIVERED,
        deliveredAt: new Date(),
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracyMetres: dto.accuracyMetres,
        proofReference: dto.evidenceId ? `trusted-drop-evidence:${dto.evidenceId}` : null,
        version: { increment: 1 },
      },
    });
    await tx.deliveryRun.update({
      where: { id: runId },
      data: {
        completedStopCount: { increment: 1 },
        collectedCashPaise: { increment: collectedCashPaise },
        version: { increment: 1 },
      },
    });
  }

  async complete(runId: string, stopId: string, dto: CompleteRunStopDto, actor: Actor, idempotencyKey?: string) {
    const { rider, run } = await this.ownedRun(runId, actor);
    const stop = run.stops.find((candidate) => candidate.id === stopId);
    if (!stop) throw new NotFoundException('Run stop not found');
    if (stop.status === DeliveryRunStopStatus.DELIVERED) return stop;
    if (stop.version !== dto.version) throw new ConflictException('Run stop changed; refresh and try again');
    if (stop.status !== DeliveryRunStopStatus.ARRIVED) throw new BadRequestException('Mark arrival before completing a stop');
    const key = idempotencyKey || `run-stop-complete:${stopId}`;
    const deliveryMethod = stop.subscriptionDelivery.subscription.deliveryMethod;
    const payment = stop.deliveryJob.order.payment;
    let trustedDropChallengeId: string | null = null;

    if (deliveryMethod === SubscriptionDeliveryMethod.TRUSTED_DROP && stop.cashDuePaise === 0) {
      if (!dto.trustedDropToken) throw new BadRequestException('Scan the current Trusted Drop QR before completing the stop');
      if (!dto.evidenceId) throw new BadRequestException('Capture and upload a Trusted Drop photo before completing the stop');
      const completionGeofence = await prisma.$transaction((tx) => this.trustedDrop.recordGeofence(tx, {
        stopId: stop.id, riderId: rider.id, phase: GeofencePhase.COMPLETION,
        latitude: dto.latitude, longitude: dto.longitude, accuracyMetres: dto.accuracyMetres,
      }));
      if (!completionGeofence.passed) {
        throw new BadRequestException(
          completionGeofence.proof.decision === 'FAIL_ACCURACY'
            ? 'GPS accuracy is not sufficient for Trusted Drop completion'
            : `Trusted Drop completion is outside the ${Math.round(completionGeofence.proof.allowedRadiusMetres)} metre geofence`,
        );
      }
      const challenge = await prisma.$transaction((tx) => this.trustedDrop.verifyForStop(tx, dto.trustedDropToken!, stop, rider.id));
      const evidence = await prisma.trustedDropEvidence.findFirst({
        where: { id: dto.evidenceId, deliveryRunStopId: stop.id, challengeId: challenge.id, riderId: rider.id },
      });
      if (!evidence) throw new BadRequestException('Uploaded Trusted Drop evidence does not match this stop and QR');
      trustedDropChallengeId = challenge.id;
    }

    if (stop.cashDuePaise > 0) {
      if (!dto.otpCode) throw new BadRequestException('Customer OTP is mandatory for cash funding collection');
      if (dto.cashCollectedPaise !== stop.cashDuePaise) {
        throw new BadRequestException(`Collect exactly ${stop.cashDuePaise} paise for this funding cycle`);
      }
      if (payment?.method !== PaymentMethod.COD) throw new ConflictException('Cash-due stop is not linked to a COD payment');
      await this.deliveryOperations.completeCodDelivery(
        stop.deliveryJobId,
        actor,
        {
          riderConfirmed: dto.riderConfirmed,
          otpCode: dto.otpCode,
          proofType: deliveryMethod === SubscriptionDeliveryMethod.SECURITY_RECEPTION ? 'SECURITY_RECEPTION' : 'CUSTOMER_OTP_PIN',
          note: dto.note,
          latitude: dto.latitude,
          longitude: dto.longitude,
          accuracyMetres: dto.accuracyMetres,
        },
        {
          amountPaise: stop.cashDuePaise,
          collectionReference: `RUN:${run.routeCode}:STOP:${stop.sequenceNumber}`,
        },
        key,
        async (tx) => {
          await this.funding.allocateAfterCodCollectionWithinTransaction(tx, stop.deliveryJobId, actor, `funding:${key}`);
          await this.funding.consumeDeliveredWithinTransaction(tx, stop.subscriptionDeliveryId, actor, `entitlement:${key}`);
          await this.finalizeDeliveredStopWithinTransaction(tx, runId, stopId, dto.version, stop.cashDuePaise, dto);
        },
      );
    } else {
      if (dto.cashCollectedPaise && dto.cashCollectedPaise > 0) {
        throw new BadRequestException('Customer amount due is ₹0 — do not collect cash');
      }
      if (deliveryMethod === SubscriptionDeliveryMethod.TRUSTED_DROP) {
        await this.deliveryOperations.completeTrustedDrop(
          stop.deliveryJobId,
          actor,
          {
            riderConfirmed: dto.riderConfirmed,
            evidenceId: dto.evidenceId!,
            challengeId: trustedDropChallengeId!,
            note: dto.note,
            latitude: dto.latitude,
            longitude: dto.longitude,
            accuracyMetres: dto.accuracyMetres,
          },
          `proof:${key}`,
          async (tx) => {
            await this.funding.consumeDeliveredWithinTransaction(tx, stop.subscriptionDeliveryId, actor, `entitlement:${key}`);
            await this.finalizeDeliveredStopWithinTransaction(tx, runId, stopId, dto.version, 0, dto);
          },
        );
      } else {
        if (!dto.otpCode) throw new BadRequestException('Customer OTP is required for personal handover');
        await this.deliveryOperations.completeDelivery(
          stop.deliveryJobId,
          actor,
          {
            riderConfirmed: dto.riderConfirmed,
            otpCode: dto.otpCode,
            proofType: deliveryMethod === SubscriptionDeliveryMethod.SECURITY_RECEPTION ? 'SECURITY_RECEPTION' : 'CUSTOMER_OTP_PIN',
            note: dto.note,
            latitude: dto.latitude,
            longitude: dto.longitude,
            accuracyMetres: dto.accuracyMetres,
          },
          `proof:${key}`,
          async (tx) => {
            await this.funding.consumeDeliveredWithinTransaction(tx, stop.subscriptionDeliveryId, actor, `entitlement:${key}`);
            await this.finalizeDeliveredStopWithinTransaction(tx, runId, stopId, dto.version, 0, dto);
          },
        );
      }
    }

    return prisma.deliveryRunStop.findUnique({ where: { id: stopId } });
  }

  async fail(runId: string, stopId: string, dto: FailRunStopDto, actor: Actor, idempotencyKey?: string) {
    const { run } = await this.ownedRun(runId, actor);
    const stop = run.stops.find((candidate) => candidate.id === stopId);
    if (!stop) throw new NotFoundException('Run stop not found');
    const key = idempotencyKey || `run-stop-failure:${stopId}:${stop.retryCount}`;
    if (idempotencyKey) {
      const prior = await prisma.subscriptionAuditEntry.findUnique({
        where: { idempotencyKey: `subscription-failure:${key}` },
      });
      if (prior) return stop;
    }
    if (stop.version !== dto.version) throw new ConflictException('Run stop changed; refresh and try again');
    if (!isOneOf(stop.status, [DeliveryRunStopStatus.ARRIVED, DeliveryRunStopStatus.READY])) {
      throw new BadRequestException(`Stop cannot fail from ${stop.status}`);
    }
    const failure = await this.deliveryOperations.recordFailure(
      stop.deliveryJobId,
      actor,
      { reason: dto.reason, note: dto.note },
      `failure:${key}`,
    );
    const decision = failure.decision ?? await prisma.deliveryFailureDecision.findFirst({
      where: { deliveryJobId: stop.deliveryJobId },
      orderBy: { createdAt: 'desc' },
    });
    if (!decision) throw new ConflictException('Delivery failure resolution is unavailable');
    const returnRequired = decision.decidedAction === DeliveryResolutionAction.RETURN_TO_STORE;
    const retryPending = !returnRequired && Boolean(dto.retryRequested) &&
      decision.decidedAction === DeliveryResolutionAction.RETRY_DELIVERY;
    if (returnRequired) {
      await this.deliveryOperations.startReturn(stop.deliveryJobId, actor, `return:${key}`);
    } else if (retryPending) {
      await this.deliveryOperations.retryFailedDelivery(stop.deliveryJobId, actor, `retry:${key}`);
    }
    await this.funding.recordFailure(
      stop.subscriptionDeliveryId,
      actor,
      dto.reason,
      retryPending,
      `subscription-failure:${key}`,
    );
    return prisma.$transaction(async (tx) => {
      await tx.deliveryRunStop.update({
        where: { id: stopId },
        data: {
          status: returnRequired
            ? DeliveryRunStopStatus.RETURN_REQUIRED
            : retryPending
              ? DeliveryRunStopStatus.RETRY_PENDING
              : DeliveryRunStopStatus.FAILED,
          failedAt: new Date(),
          failureReason: [dto.reason, dto.note].filter(Boolean).join(': '),
          retryCount: retryPending ? { increment: 1 } : undefined,
          latitude: dto.latitude,
          longitude: dto.longitude,
          accuracyMetres: dto.accuracyMetres,
          version: { increment: 1 },
        },
      });
      await tx.deliveryRun.update({
        where: { id: runId },
        data: {
          failedStopCount: { increment: retryPending ? 0 : 1 },
          retryPendingStopCount: { increment: retryPending ? 1 : 0 },
          version: { increment: 1 },
        },
      });
      return tx.deliveryRunStop.findUnique({ where: { id: stopId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async reorder(runId: string, stopId: string, dto: ReorderRunStopDto, actor: Actor) {
    const { rider } = await this.ownedRun(runId, actor);
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`delivery-run-reorder:${runId}`}))`);
      const stop = await tx.deliveryRunStop.findFirst({ where: { id: stopId, deliveryRunId: runId, deliveryRun: { riderId: rider.id } } });
      if (!stop) throw new NotFoundException('Run stop not found');
      if (stop.version !== dto.version) throw new ConflictException('Run stop changed; refresh and try again');
      if (isOneOf(stop.status, [DeliveryRunStopStatus.DELIVERED, DeliveryRunStopStatus.CANCELLED])) {
        throw new BadRequestException('Completed stops cannot be reordered');
      }
      const count = await tx.deliveryRunStop.count({ where: { deliveryRunId: runId } });
      if (dto.newSequenceNumber > count) throw new BadRequestException('New route position is outside this run');
      const old = stop.sequenceNumber;
      if (old === dto.newSequenceNumber) return stop;
      await tx.deliveryRunStop.update({ where: { id: stop.id }, data: { sequenceNumber: 0 } });
      if (dto.newSequenceNumber < old) {
        await tx.deliveryRunStop.updateMany({
          where: { deliveryRunId: runId, sequenceNumber: { gte: dto.newSequenceNumber, lt: old } },
          data: { sequenceNumber: { increment: 1 } },
        });
      } else {
        await tx.deliveryRunStop.updateMany({
          where: { deliveryRunId: runId, sequenceNumber: { gt: old, lte: dto.newSequenceNumber } },
          data: { sequenceNumber: { decrement: 1 } },
        });
      }
      return tx.deliveryRunStop.update({
        where: { id: stop.id },
        data: { sequenceNumber: dto.newSequenceNumber, routeOrderChangeReason: dto.reason.trim(), version: { increment: 1 } },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

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
