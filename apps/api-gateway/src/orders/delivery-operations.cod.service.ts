/**
 * COD collection, settlement and trusted drop.
 *
 * Split out of the former delivery-operations.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { CodLedgerEntryType, CodSettlementStatus, PaymentMethod, PaymentStatus, Prisma, prisma } from "@aagam/database";
import { DeliveryJobStatus } from "@aagam/types";
import { CollectCodDto, CompleteDeliveryOperationDto, SettleCodDto } from "./delivery-operations.dto";
import { Actor, DeliveryCommitHook, OTP_MAX_ATTEMPTS } from "./delivery-operations.types";
import { DeliveryOperationsBase } from "./delivery-operations.base";
import { DeliveryWorkflowService } from "./delivery-workflow.service";
import { OutboxService } from "../notifications/outbox.service";
import { SubscriptionCashFundingService } from "../subscriptions/subscription-cash-funding.service";

@Injectable()
export class DeliveryOperationsCodService extends DeliveryOperationsBase {
  constructor(
    workflow: DeliveryWorkflowService,
    outbox: OutboxService,
    subscriptionFunding: SubscriptionCashFundingService
  ) {
    super(workflow, outbox, subscriptionFunding);
  }

  async completeCodDelivery(
    deliveryJobId: string,
    actor: Actor,
    input: CompleteDeliveryOperationDto,
    codInput: CollectCodDto,
    idempotencyKey?: string,
    afterDelivery?: DeliveryCommitHook
  ) {
    const outcome = await prisma.$transaction(
      async (tx) => {
        await this.lock(tx, `delivery-complete:${deliveryJobId}`);
        await this.lock(tx, `cod-collection:${deliveryJobId}`);
        const job = await this.job(tx, deliveryJobId);
        this.assertRiderOrAdmin(job, actor);
        if (job.status === DeliveryJobStatus.DELIVERED) {
          await this.reconcileSubscriptionAfterDelivery(tx, job, actor);
          if (afterDelivery) await afterDelivery(tx);
          return { job };
        }
        if (job.status !== DeliveryJobStatus.RIDER_AT_CUSTOMER) {
          throw new BadRequestException(
            "Rider must arrive at the customer before completing delivery"
          );
        }
        if (input.riderConfirmed !== true) {
          throw new BadRequestException("Rider confirmation is required");
        }
        if (!input.otpCode) {
          throw new BadRequestException("Customer delivery OTP/PIN is required");
        }
        this.assertCoordinates(input.latitude, input.longitude);
        const verified = await this.verifyOtpWithinTransaction(
          tx,
          job,
          actor,
          input.otpCode
        );
        if (!verified.ok) return { otpError: verified };

        const payment = job.order.payment;
        if (!payment || payment.method !== PaymentMethod.COD) {
          throw new BadRequestException("This order is not a COD order");
        }
        if (codInput.amountPaise !== payment.amountPaise) {
          throw new BadRequestException(
            `COD amount must equal ${payment.amountPaise} paise`
          );
        }
        if (
          payment.status !== PaymentStatus.PENDING_COD &&
          payment.status !== PaymentStatus.CAPTURED
        ) {
          throw new BadRequestException(
            `COD payment cannot be collected from status ${payment.status}`
          );
        }

        const collectionKey = `cod:${idempotencyKey || deliveryJobId}`;
        let ledger = await this.ensureCodLedger(tx, job, actor);
        if (ledger.collectedAmountPaise === 0) {
          if (payment.status !== PaymentStatus.CAPTURED) {
            const changed = await tx.payment.updateMany({
              where: { id: payment.id, status: PaymentStatus.PENDING_COD },
              data: { status: PaymentStatus.CAPTURED, verifiedAt: new Date() },
            });
            if (changed.count !== 1) {
              throw new ConflictException("COD payment changed during collection");
            }
          }
          const collectedAt = new Date();
          ledger = await tx.codLedger.update({
            where: { id: ledger.id },
            data: {
              riderId: job.currentRiderId,
              collectedAmountPaise: codInput.amountPaise,
              collectionTimestamp: collectedAt,
              riderHoldingBalancePaise: codInput.amountPaise,
              variancePaise: 0,
              status: CodSettlementStatus.HELD_BY_RIDER,
            },
            include: { entries: { orderBy: { createdAt: "asc" } } },
          });
          await tx.codLedgerEntry.create({
            data: {
              codLedgerId: ledger.id,
              type: CodLedgerEntryType.COLLECTED,
              amountPaise: codInput.amountPaise,
              holdingAfterPaise: codInput.amountPaise,
              depositedAfterPaise: 0,
              actorUserId: actor.id,
              actorRole: actor.role,
              reference: codInput.collectionReference,
              idempotencyKey: `cod-ledger-collection:${collectionKey}`,
              metadata: {
                collectedAt: collectedAt.toISOString(),
                paymentId: payment.id,
              },
            },
          });
          const operation = await this.createOperation(tx, {
            deliveryJobId,
            orderId: job.orderId,
            type: "COD_COLLECTED",
            actor,
            idempotencyKey: collectionKey,
            details: {
              amountPaise: codInput.amountPaise,
              codLedgerId: ledger.id,
              currency: payment.currency,
              collectionReference: codInput.collectionReference || null,
              collectedAt: collectedAt.toISOString(),
              riderHoldingBalancePaise: ledger.riderHoldingBalancePaise,
            },
          });
          await this.notify(
            tx,
            job,
            actor,
            "DELIVERY_COMPLETED",
            "COD payment collected",
            `₹${(codInput.amountPaise / 100).toFixed(2)} was collected for order #${job.orderId
              .slice(-8)
              .toUpperCase()}.`,
            operation,
            { amountPaise: codInput.amountPaise }
          );
        } else if (
          ledger.collectedAmountPaise !== codInput.amountPaise ||
          payment.status !== PaymentStatus.CAPTURED
        ) {
          throw new ConflictException("Existing COD ledger does not match the expected collection");
        }

        if (!job.currentRiderId) {
          throw new BadRequestException("Delivery has no assigned Rider");
        }
        const riderConfirmedAt = new Date();
        const verificationMethod = input.proofType === "SECURITY_RECEPTION"
          ? "SECURITY_RECEPTION"
          : "CUSTOMER_OTP_PIN";
        const proof = await tx.deliveryProof.create({
          data: {
            deliveryJobId,
            orderId: job.orderId,
            riderId: job.currentRiderId,
            customerUserId: job.order.customerId,
            verificationMethod,
            otpOperationId: verified.operation.id,
            riderConfirmedAt,
            verifiedAt: riderConfirmedAt,
            note: input.note,
            latitude: input.latitude,
            longitude: input.longitude,
            accuracyMetres: input.accuracyMetres,
          },
        });
        await this.createOperation(tx, {
          deliveryJobId,
          orderId: job.orderId,
          type: "DELIVERY_PROOF_RECORDED",
          actor,
          idempotencyKey: `delivery-proof:${deliveryJobId}`,
          details: {
            deliveryProofId: proof.id,
            riderId: job.currentRiderId,
            customerUserId: job.order.customerId,
            verificationMethod,
            otpOperationId: verified.operation.id,
            riderConfirmedAt: riderConfirmedAt.toISOString(),
            verifiedAt: riderConfirmedAt.toISOString(),
            note: input.note || null,
            latitude: input.latitude ?? null,
            longitude: input.longitude ?? null,
            accuracyMetres: input.accuracyMetres ?? null,
          },
        });
        const delivered = await this.workflow.transitionWithinTransaction(
          tx,
          deliveryJobId,
          DeliveryJobStatus.DELIVERED,
          actor,
          {
            expectedStatus: DeliveryJobStatus.RIDER_AT_CUSTOMER,
            metadata: {
              phase5DeliveryProofId: proof.id,
              proofType: verificationMethod,
              riderConfirmed: true,
              coordinatesRecorded: input.latitude != null,
              completionIdempotencyKey: idempotencyKey || null,
              cashCollectedAtomically: true,
            },
          }
        );
        await this.completeActiveFailureDecisions(tx, deliveryJobId, actor);
        await this.reconcileSubscriptionAfterDelivery(tx, job, actor);
        if (afterDelivery) await afterDelivery(tx);
        return { job: delivered };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    if ("otpError" in outcome && outcome.otpError) {
      if (outcome.otpError.attempts >= OTP_MAX_ATTEMPTS) {
        throw new HttpException(outcome.otpError.reason, HttpStatus.TOO_MANY_REQUESTS);
      }
      throw new BadRequestException(outcome.otpError.reason);
    }
    return outcome.job;
  }

  async completeTrustedDrop(
    deliveryJobId: string,
    actor: Actor,
    input: {
      riderConfirmed: boolean;
      evidenceId: string;
      challengeId: string;
      note?: string;
      latitude: number;
      longitude: number;
      accuracyMetres?: number;
    },
    idempotencyKey?: string,
    afterDelivery?: DeliveryCommitHook
  ) {
    return prisma.$transaction(
      async (tx) => {
        await this.lock(tx, `trusted-drop:${deliveryJobId}`);
        const job = await this.job(tx, deliveryJobId);
        this.assertRiderOrAdmin(job, actor);
        if (job.status === DeliveryJobStatus.DELIVERED) {
          await this.reconcileSubscriptionAfterDelivery(tx, job, actor);
          if (afterDelivery) await afterDelivery(tx);
          return job;
        }
        if (job.status !== DeliveryJobStatus.RIDER_AT_CUSTOMER) {
          throw new BadRequestException("Rider must arrive at the customer before trusted drop");
        }
        if (input.riderConfirmed !== true) throw new BadRequestException("Rider confirmation is required");
        this.assertCoordinates(input.latitude, input.longitude);
        const subscription = job.order.subscription;
        if (!subscription || subscription.deliveryMethod !== "TRUSTED_DROP") {
          throw new ForbiddenException("This order is not authorized for trusted drop");
        }
        if (job.order.payment?.method === PaymentMethod.COD) {
          throw new BadRequestException("Cash collection deliveries require customer OTP handover");
        }
        if (!job.currentRiderId) throw new BadRequestException("Delivery has no assigned Rider");
        const evidence = await tx.trustedDropEvidence.findFirst({
          where: {
            id: input.evidenceId,
            deliveryJobId,
            riderId: job.currentRiderId,
            challengeId: input.challengeId,
          },
          include: { challenge: { include: { credential: true } } },
        });
        if (!evidence) throw new BadRequestException("Trusted Drop photo evidence is not bound to this delivery, rider, and QR challenge");
        const challenge = evidence.challenge;
        if (challenge.usedAt) throw new ConflictException("Trusted Drop QR has already been used");
        if (challenge.revokedAt || challenge.expiresAt <= new Date()) throw new BadRequestException("Trusted Drop QR is expired or revoked");
        if (challenge.credential.status !== "ACTIVE" || challenge.version !== challenge.credential.version || evidence.credentialVersion !== challenge.version) {
          throw new ConflictException("Trusted Drop QR credential version is no longer active");
        }
        const consumed = await tx.trustedDropChallenge.updateMany({
          where: { id: challenge.id, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
          data: { usedAt: new Date() },
        });
        if (consumed.count !== 1) throw new ConflictException("Trusted Drop QR was replayed or expired");
        const key = idempotencyKey || `trusted-drop:${deliveryJobId}`;
        const existing = await this.findOperationByKey(tx, key);
        if (existing) return this.job(tx, deliveryJobId);
        const completedAt = new Date();
        const proof = await tx.deliveryProof.create({
          data: {
            deliveryJobId,
            orderId: job.orderId,
            riderId: job.currentRiderId,
            customerUserId: job.order.customerId,
            verificationMethod: "TRUSTED_DROP",
            otpOperationId: null,
            proofReference: `trusted-drop-evidence:${evidence.id}`,
            riderConfirmedAt: completedAt,
            verifiedAt: completedAt,
            note: input.note,
            latitude: input.latitude,
            longitude: input.longitude,
            accuracyMetres: input.accuracyMetres,
          },
        });
        const operation = await this.createOperation(tx, {
          deliveryJobId,
          orderId: job.orderId,
          type: "DELIVERY_PROOF_RECORDED",
          actor,
          idempotencyKey: key,
          details: {
            deliveryProofId: proof.id,
            verificationMethod: "TRUSTED_DROP",
            trustedDropEvidenceId: evidence.id,
            credentialVersion: evidence.credentialVersion,
            latitude: input.latitude,
            longitude: input.longitude,
            accuracyMetres: input.accuracyMetres ?? null,
          },
        });
        const delivered = await this.workflow.transitionWithinTransaction(
          tx, deliveryJobId, DeliveryJobStatus.DELIVERED, actor,
          { expectedStatus: DeliveryJobStatus.RIDER_AT_CUSTOMER, metadata: { deliveryProofId: proof.id, proofType: "TRUSTED_DROP", trustedDropEvidenceId: evidence.id, completionIdempotencyKey: key } }
        );
        await this.notify(
          tx, job, actor, "DELIVERY_COMPLETED", "Subscription delivered",
          "Your funded subscription delivery was placed at the trusted drop point.", operation,
          { proofType: "TRUSTED_DROP", trustedDropEvidenceId: evidence.id }
        );
        await this.completeActiveFailureDecisions(tx, deliveryJobId, actor);
        await this.reconcileSubscriptionAfterDelivery(tx, job, actor);
        if (afterDelivery) await afterDelivery(tx);
        return delivered;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  async collectCod(
    deliveryJobId: string,
    actor: Actor,
    input: CollectCodDto,
    idempotencyKey?: string
  ) {
    return prisma.$transaction(
      async (tx) => {
        await this.lock(tx, `cod-collection:${deliveryJobId}`);
        const key = idempotencyKey || `cod-collected:${deliveryJobId}`;
        const existingByKey = await this.findOperationByKey(tx, key);
        if (existingByKey) return existingByKey;
        const existingCollection = await this.latestOperation(
          tx,
          deliveryJobId,
          "COD_COLLECTED",
          ["COMPLETED"]
        );
        if (existingCollection) return existingCollection;

        const job = await this.job(tx, deliveryJobId);
        this.assertRiderOrAdmin(job, actor);
        if (
          ![
            DeliveryJobStatus.OUT_FOR_DELIVERY,
            DeliveryJobStatus.RIDER_AT_CUSTOMER,
          ].includes(job.status)
        ) {
          throw new BadRequestException(
            "COD can be collected only during customer delivery"
          );
        }
        const payment = job.order.payment;
        if (!payment || payment.method !== PaymentMethod.COD) {
          throw new BadRequestException("This order is not a COD order");
        }
        if (input.amountPaise !== payment.amountPaise) {
          throw new BadRequestException(
            `COD amount must equal ${payment.amountPaise} paise`
          );
        }
        if (
          payment.status !== PaymentStatus.PENDING_COD &&
          payment.status !== PaymentStatus.CAPTURED
        ) {
          throw new BadRequestException(
            `COD payment cannot be collected from status ${payment.status}`
          );
        }
        const ledger = await this.ensureCodLedger(tx, job, actor);
        if (ledger.collectedAmountPaise > 0) {
          throw new ConflictException(
            "COD collection is already recorded in the ledger"
          );
        }
        if (payment.status !== PaymentStatus.CAPTURED) {
          const changed = await tx.payment.updateMany({
            where: { id: payment.id, status: PaymentStatus.PENDING_COD },
            data: { status: PaymentStatus.CAPTURED, verifiedAt: new Date() },
          });
          if (changed.count !== 1)
            throw new ConflictException(
              "COD payment changed during collection"
            );
        }

        const collectedAt = new Date();
        const updatedLedger = await tx.codLedger.update({
          where: { id: ledger.id },
          data: {
            riderId: job.currentRiderId,
            collectedAmountPaise: input.amountPaise,
            collectionTimestamp: collectedAt,
            riderHoldingBalancePaise: input.amountPaise,
            variancePaise: 0,
            status: CodSettlementStatus.HELD_BY_RIDER,
          },
        });
        await tx.codLedgerEntry.create({
          data: {
            codLedgerId: ledger.id,
            type: CodLedgerEntryType.COLLECTED,
            amountPaise: input.amountPaise,
            holdingAfterPaise: input.amountPaise,
            depositedAfterPaise: 0,
            actorUserId: actor.id,
            actorRole: actor.role,
            reference: input.collectionReference,
            idempotencyKey: `cod-ledger-collection:${key}`,
            metadata: {
              collectedAt: collectedAt.toISOString(),
              paymentId: payment.id,
            },
          },
        });

        const operation = await this.createOperation(tx, {
          deliveryJobId,
          orderId: job.orderId,
          type: "COD_COLLECTED",
          actor,
          idempotencyKey: key,
          details: {
            amountPaise: input.amountPaise,
            codLedgerId: ledger.id,
            currency: payment.currency,
            collectionReference: input.collectionReference || null,
            collectedAt: collectedAt.toISOString(),
            riderHoldingBalancePaise: updatedLedger.riderHoldingBalancePaise,
          },
        });
        await this.notify(
          tx,
          job,
          actor,
          "DELIVERY_COMPLETED",
          "COD payment collected",
          `₹${(input.amountPaise / 100).toFixed(
            2
          )} was collected for order #${job.orderId.slice(-8).toUpperCase()}.`,
          operation,
          { amountPaise: input.amountPaise }
        );
        return operation;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  async settleCod(
    deliveryJobId: string,
    actor: Actor,
    input: SettleCodDto,
    idempotencyKey?: string
  ) {
    return prisma.$transaction(
      async (tx) => {
        await this.lock(tx, `cod-settlement:${deliveryJobId}`);
        const key =
          idempotencyKey ||
          `cod-settled:${deliveryJobId}:${input.settlementReference}`;
        const existingByKey = await this.findOperationByKey(tx, key);
        if (existingByKey) return existingByKey;

        const job = await this.job(tx, deliveryJobId);
        this.assertStoreOrAdmin(job, actor);
        const payment = job.order.payment;
        if (!payment || payment.method !== PaymentMethod.COD) {
          throw new BadRequestException("This order is not a COD order");
        }
        if (payment.status !== PaymentStatus.CAPTURED) {
          throw new BadRequestException(
            "COD must be collected before settlement"
          );
        }
        const collection = await this.latestOperation(
          tx,
          deliveryJobId,
          "COD_COLLECTED",
          ["COMPLETED"]
        );
        if (!collection)
          throw new BadRequestException("COD collection record is missing");
        const ledger = await tx.codLedger.findUnique({
          where: { deliveryJobId },
        });
        if (!ledger) throw new BadRequestException("COD ledger is missing");
        if (
          ledger.status === CodSettlementStatus.SETTLED ||
          ledger.status === CodSettlementStatus.VARIANCE_REVIEW
        ) {
          throw new ConflictException("COD ledger is already finalized");
        }
        if (input.amountPaise > ledger.riderHoldingBalancePaise) {
          throw new BadRequestException(
            `Deposit cannot exceed Rider holding balance of ${ledger.riderHoldingBalancePaise} paise`
          );
        }
        const depositedAmountPaise =
          ledger.depositedAmountPaise + input.amountPaise;
        const riderHoldingBalancePaise =
          ledger.riderHoldingBalancePaise - input.amountPaise;
        const variancePaise = ledger.expectedAmountPaise - depositedAmountPaise;
        if (input.finalize && variancePaise !== 0 && !input.varianceReason) {
          throw new BadRequestException(
            "A variance reason is required to finalize a non-zero COD variance"
          );
        }
        const status = input.finalize
          ? variancePaise === 0
            ? CodSettlementStatus.SETTLED
            : CodSettlementStatus.VARIANCE_REVIEW
          : riderHoldingBalancePaise === 0
          ? CodSettlementStatus.SETTLED
          : CodSettlementStatus.PARTIALLY_DEPOSITED;
        const settledAt = new Date();
        const updatedLedger = await tx.codLedger.update({
          where: { id: ledger.id },
          data: {
            depositedAmountPaise,
            riderHoldingBalancePaise,
            settlementReference: input.settlementReference,
            variancePaise: input.finalize ? variancePaise : 0,
            varianceReason: input.finalize ? input.varianceReason : null,
            status,
          },
        });
        await tx.codLedgerEntry.create({
          data: {
            codLedgerId: ledger.id,
            type: CodLedgerEntryType.DEPOSITED,
            amountPaise: input.amountPaise,
            holdingAfterPaise: riderHoldingBalancePaise,
            depositedAfterPaise: depositedAmountPaise,
            actorUserId: actor.id,
            actorRole: actor.role,
            reference: input.settlementReference,
            idempotencyKey: `cod-ledger-deposit:${key}`,
            metadata: {
              note: input.note || null,
              finalized: Boolean(input.finalize),
            },
          },
        });
        if (input.finalize && variancePaise !== 0) {
          await tx.codLedgerEntry.create({
            data: {
              codLedgerId: ledger.id,
              type: CodLedgerEntryType.VARIANCE_RECORDED,
              amountPaise: Math.abs(variancePaise),
              holdingAfterPaise: riderHoldingBalancePaise,
              depositedAfterPaise: depositedAmountPaise,
              actorUserId: actor.id,
              actorRole: actor.role,
              reference: input.settlementReference,
              idempotencyKey: `cod-ledger-variance:${key}`,
              metadata: { variancePaise, varianceReason: input.varianceReason },
            },
          });
          await this.createOperation(tx, {
            deliveryJobId,
            orderId: job.orderId,
            type: "COD_VARIANCE_RECORDED",
            actor,
            idempotencyKey: `cod-variance:${key}`,
            details: {
              codLedgerId: ledger.id,
              variancePaise,
              varianceReason: input.varianceReason,
              settlementReference: input.settlementReference,
            },
          });
        }

        const operation = await this.createOperation(tx, {
          deliveryJobId,
          orderId: job.orderId,
          type: "COD_SETTLED",
          actor,
          idempotencyKey: key,
          details: {
            amountPaise: input.amountPaise,
            codLedgerId: ledger.id,
            currency: payment.currency,
            settlementReference: input.settlementReference,
            note: input.note || null,
            collectionOperationId: collection.id,
            settledAt: settledAt.toISOString(),
            finalized: Boolean(input.finalize),
            depositedAmountPaise: updatedLedger.depositedAmountPaise,
            riderHoldingBalancePaise: updatedLedger.riderHoldingBalancePaise,
            variancePaise: updatedLedger.variancePaise,
            settlementStatus: updatedLedger.status,
          },
        });
        await this.notify(
          tx,
          job,
          actor,
          "DELIVERY_COMPLETED",
          "COD settlement recorded",
          `COD settlement for order #${job.orderId
            .slice(-8)
            .toUpperCase()} was recorded.`,
          operation,
          {
            amountPaise: input.amountPaise,
            settlementReference: input.settlementReference,
          }
        );
        return operation;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }
}
