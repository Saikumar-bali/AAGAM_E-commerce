/**
 * Stop arrival, OTP, completion, failure and reordering.
 *
 * Split out of the former delivery-run-operations.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DeliveryResolutionAction, DeliveryRunStatus, DeliveryRunStopStatus, GeofencePhase, PaymentMethod, Prisma, SubscriptionDeliveryMethod, SubscriptionProofMode, prisma } from '@aagam/database';
import { DeliveryJobStatus } from '@aagam/types';
import { ArriveRunStopDto, CompleteRunStopDto, FailRunStopDto, ReorderRunStopDto } from './subscriptions.dto';
import { isOneOf } from '../common/enum-membership';
import { DeliveryWorkflowService } from '../orders/delivery-workflow.service';
import { DeliveryOperationsService } from '../orders/delivery-operations.service';
import { SubscriptionCashFundingService } from './subscription-cash-funding.service';
import { TrustedDropService } from './trusted-drop.service';
import { DeliveryRunOperationsServiceBase, Actor } from './delivery-run-operations.service.base';

export class DeliveryRunStopService extends DeliveryRunOperationsServiceBase {
  constructor(private readonly workflow: DeliveryWorkflowService, private readonly deliveryOperations: DeliveryOperationsService, private readonly funding: SubscriptionCashFundingService, private readonly trustedDrop: TrustedDropService) {
    super();
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

    if (stop.proofMode === SubscriptionProofMode.RIDER_PHOTO_GPS) {
      if (!Number.isFinite(dto.latitude) || !Number.isFinite(dto.longitude)) {
        throw new BadRequestException('GPS coordinates (latitude, longitude) are required for Rider Photo Proof completion');
      }
      const photoKey = dto.evidenceId || (dto as any).proofReference;
      if (!photoKey) {
        throw new BadRequestException('A delivery photo proof is required before completing this stop');
      }

      const cashCollected = dto.cashCollectedPaise || 0;

      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`delivery-run-stop-finalize:${stopId}`}))`);
        const currentStop = await tx.deliveryRunStop.findUnique({
          where: { id: stopId },
          include: { deliveryRun: { select: { riderId: true } } },
        });
        if (!currentStop) throw new NotFoundException('Run stop not found');
        // Re-assert ownership inside the transaction: the guarded pre-check ran
        // outside it, so the run may have been reassigned in the meantime.
        if (currentStop.deliveryRun.riderId !== rider.id) {
          throw new NotFoundException('Assigned delivery run not found');
        }
        if (currentStop.status === DeliveryRunStopStatus.DELIVERED) return;
        if (currentStop.version !== dto.version) throw new ConflictException('Run stop changed; refresh and try again');

        // Upsert RiderPhotoProof
        await tx.riderPhotoProof.upsert({
          where: { deliveryRunStopId: stop.id },
          create: {
            deliveryRunStopId: stop.id,
            deliveryJobId: stop.deliveryJobId,
            subscriptionDeliveryId: stop.subscriptionDeliveryId,
            riderProfileId: rider.id,
            storageKey: photoKey,
            capturedAt: new Date(),
            gpsLat: dto.latitude,
            gpsLng: dto.longitude,
            accuracyMetres: dto.accuracyMetres ?? null,
            cashCollectedPaise: cashCollected > 0 ? cashCollected : null,
          },
          update: {
            storageKey: photoKey,
            capturedAt: new Date(),
            gpsLat: dto.latitude,
            gpsLng: dto.longitude,
            accuracyMetres: dto.accuracyMetres ?? null,
            cashCollectedPaise: cashCollected > 0 ? cashCollected : null,
          },
        });

        // Cash collection handling
        if (cashCollected > 0) {
          await tx.subscriptionDelivery.update({
            where: { id: stop.subscriptionDeliveryId },
            data: {
              cashCollectedPaise: cashCollected,
              cashCollectedAt: new Date(),
            },
          });
          const sub = stop.subscriptionDelivery.subscription;
          await tx.customerSubscription.update({
            where: { id: sub.id },
            data: {
              amountCollectedPaise: { increment: cashCollected },
              amountDuePaise: { decrement: cashCollected },
            },
          });

          // Track in COD ledger for rider cash accountability
          const ledger = await tx.codLedger.findUnique({
            where: { deliveryJobId: stop.deliveryJobId },
          });
          if (!ledger) {
            throw new ConflictException('Cash was collected for a stop with no COD ledger to hold it');
          }
          const holdingAfterPaise = ledger.riderHoldingBalancePaise + cashCollected;
          await tx.codLedger.update({
            where: { id: ledger.id },
            data: {
              riderId: rider.id,
              collectedAmountPaise: { increment: cashCollected },
              riderHoldingBalancePaise: { increment: cashCollected },
              collectionTimestamp: new Date(),
              status: 'HELD_BY_RIDER',
            },
          });
          await tx.codLedgerEntry.create({
            data: {
              codLedgerId: ledger.id,
              type: 'COLLECTED',
              amountPaise: cashCollected,
              holdingAfterPaise,
              depositedAfterPaise: ledger.depositedAmountPaise,
              actorUserId: actor.id,
              actorRole: actor.role,
              reference: `RUN:${run.routeCode}:STOP:${stop.sequenceNumber}`,
              idempotencyKey: `cod-stop-complete:${stop.id}:${cashCollected}`,
            },
          });
        }

        // Finalize stop
        await tx.deliveryRunStop.update({
          where: { id: stopId },
          data: {
            status: DeliveryRunStopStatus.DELIVERED,
            deliveredAt: new Date(),
            latitude: dto.latitude,
            longitude: dto.longitude,
            accuracyMetres: dto.accuracyMetres,
            proofReference: `rider-photo:${photoKey}`,
            version: { increment: 1 },
          },
        });

        // Consume the funded entitlement. This owns the delivery status, the
        // completedDeliveries counter, and the funding-cycle transitions, so the
        // photo proof path cannot diverge from the OTP and Trusted Drop paths.
        await this.funding.consumeDeliveredWithinTransaction(
          tx,
          stop.subscriptionDeliveryId,
          actor,
          `entitlement:${key}`,
        );

        // Update delivery run aggregates
        await tx.deliveryRun.update({
          where: { id: runId },
          data: {
            completedStopCount: { increment: 1 },
            collectedCashPaise: { increment: cashCollected },
            version: { increment: 1 },
          },
        });

        // Update delivery job
        if (stop.deliveryJobId) {
          await tx.deliveryJob.update({
            where: { id: stop.deliveryJobId },
            data: {
              status: DeliveryJobStatus.DELIVERED,
            },
          });
        }
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      return prisma.deliveryRunStop.findUnique({ where: { id: stopId } });
    }

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

  protected async finalizeDeliveredStopWithinTransaction(
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
}
