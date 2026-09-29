/**
 * Delivery completion and admin overrides.
 *
 * Split out of the former delivery-operations.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { CodLedgerEntryType, CodSettlementStatus, OrderStatus, PaymentMethod, PaymentStatus, Prisma, Role, prisma } from "@aagam/database";
import { DeliveryJobStatus } from "@aagam/types";
import { AdminForceCompleteDeliveryDto, AdminReconcileOrderDto, CompleteDeliveryOperationDto } from "./delivery-operations.dto";
import { Actor, DeliveryCommitHook, OTP_MAX_ATTEMPTS } from "./delivery-operations.types";
import { reconcileRiderOperationalStatus } from "../riders/rider-operational-status";
import { DeliveryOperationsBase } from "./delivery-operations.base";
import { DeliveryWorkflowService } from "./delivery-workflow.service";
import { OutboxService } from "../notifications/outbox.service";
import { SubscriptionCashFundingService } from "../subscriptions/subscription-cash-funding.service";

@Injectable()
export class DeliveryOperationsDeliveryService extends DeliveryOperationsBase {
  constructor(
    workflow: DeliveryWorkflowService,
    outbox: OutboxService,
    subscriptionFunding: SubscriptionCashFundingService
  ) {
    super(workflow, outbox, subscriptionFunding);
  }

  async completeDelivery(
    deliveryJobId: string,
    actor: Actor,
    input: CompleteDeliveryOperationDto,
    idempotencyKey?: string,
    afterDelivery?: DeliveryCommitHook
  ) {
    const outcome = await prisma.$transaction(
      async (tx) => {
        await this.lock(tx, `delivery-complete:${deliveryJobId}`);
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
        if (!input.otpCode)
          throw new BadRequestException(
            "Customer delivery OTP/PIN is required"
          );
        this.assertCoordinates(input.latitude, input.longitude);
        const verified = await this.verifyOtpWithinTransaction(
          tx,
          job,
          actor,
          input.otpCode
        );
        if (!verified.ok) return { otpError: verified };

        const payment = job.order.payment;
        if (payment?.method === PaymentMethod.COD) {
          const ledger = await tx.codLedger.findUnique({
            where: { deliveryJobId },
          });
          if (
            payment.status !== PaymentStatus.CAPTURED ||
            !ledger ||
            ledger.collectedAmountPaise !== ledger.expectedAmountPaise
          ) {
          throw new BadRequestException(
            "Collect the full COD amount into the independent COD ledger before completing delivery"
          );
          }
        }

        if (!job.currentRiderId)
          throw new BadRequestException("Delivery has no assigned Rider");
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
        throw new HttpException(
          outcome.otpError.reason,
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
      throw new BadRequestException(outcome.otpError.reason);
    }
    return outcome.job;
  }

  async adminForceCompleteDelivery(
    deliveryJobId: string,
    actor: Actor,
    input: AdminForceCompleteDeliveryDto,
    idempotencyKey?: string
  ) {
    if (actor.role !== Role.ADMIN) {
      throw new ForbiddenException("Only an administrator can force-complete a delivery");
    }
    const reason = input.reason.trim();
    const key = idempotencyKey || `admin-force-complete:${deliveryJobId}`;
    return prisma.$transaction(async (tx) => {
      await this.lock(tx, `delivery-complete:${deliveryJobId}`);
      const job = await this.job(tx, deliveryJobId);
      if (job.status === DeliveryJobStatus.DELIVERED) {
        await this.reconcileSubscriptionAfterDelivery(tx, job, actor);
        return job;
      }
      if ([DeliveryJobStatus.CANCELLED, DeliveryJobStatus.RETURNED_TO_STORE].includes(job.status)) {
        throw new BadRequestException(`Cannot force-complete delivery from ${job.status}`);
      }
      if (!job.currentRiderId) throw new BadRequestException("Delivery has no assigned Rider");

      const payment = job.order.payment;
      if (payment?.method === PaymentMethod.COD) {
        if (input.codAmountPaise !== payment.amountPaise) {
          throw new BadRequestException(`COD amount must equal ${payment.amountPaise} paise`);
        }
        const ledger = await this.ensureCodLedger(tx, job, actor);
        if (ledger.collectedAmountPaise === 0) {
          const collectedAt = new Date();
          if (payment.status === PaymentStatus.PENDING_COD) {
            await tx.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.CAPTURED, verifiedAt: collectedAt } });
          } else if (payment.status !== PaymentStatus.CAPTURED) {
            throw new BadRequestException(`COD payment cannot be collected from status ${payment.status}`);
          }
          await tx.codLedger.update({
            where: { id: ledger.id },
            data: {
              riderId: job.currentRiderId,
              collectedAmountPaise: input.codAmountPaise,
              collectionTimestamp: collectedAt,
              riderHoldingBalancePaise: input.codAmountPaise,
              variancePaise: 0,
              status: CodSettlementStatus.HELD_BY_RIDER,
            },
          });
          await tx.codLedgerEntry.create({
            data: {
              codLedgerId: ledger.id,
              type: CodLedgerEntryType.COLLECTED,
              amountPaise: input.codAmountPaise,
              holdingAfterPaise: input.codAmountPaise,
              depositedAfterPaise: 0,
              actorUserId: actor.id,
              actorRole: actor.role,
              reference: "ADMIN_FORCE_COMPLETE",
              idempotencyKey: `cod-ledger-collection:${key}`,
              metadata: { adminOverride: true, reason, collectedAt: collectedAt.toISOString() },
            },
          });
        } else if (ledger.collectedAmountPaise !== input.codAmountPaise) {
          throw new ConflictException("Existing COD collection does not match the override amount");
        }
      } else if (input.codAmountPaise !== 0) {
        throw new BadRequestException("COD amount must be zero for a non-COD order");
      }

      const now = new Date();
      const proof = job.deliveryProof || await tx.deliveryProof.create({
        data: {
          deliveryJobId,
          orderId: job.orderId,
          riderId: job.currentRiderId,
          customerUserId: job.order.customerId,
          verificationMethod: "SECURITY_RECEPTION",
          proofReference: key,
          riderConfirmedAt: now,
          verifiedAt: now,
          note: `ADMIN OVERRIDE: ${reason}`,
        },
      });
      await this.createOperation(tx, {
        deliveryJobId,
        orderId: job.orderId,
        type: "DELIVERY_PROOF_RECORDED",
        actor,
        idempotencyKey: key,
        details: { adminOverride: true, reason, deliveryProofId: proof.id, codAmountPaise: input.codAmountPaise },
      });
      const delivered = await this.workflow.transitionWithinTransaction(tx, deliveryJobId, DeliveryJobStatus.DELIVERED, actor, {
        allowAdminOverride: true,
        metadata: { adminOverride: true, reason, deliveryProofId: proof.id, codAmountPaise: input.codAmountPaise },
      });
      await this.reconcileSubscriptionAfterDelivery(tx, job, actor);
      return delivered;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  /**
   * Reconciles a delivery job left non-terminal because its order was already
   * closed as DELIVERED through the plain order-status path while the job was
   * still active (for example when an administrator marks an order delivered
   * from the orders dashboard). Completes the job, cancels outstanding
   * assignments, records an admin delivery proof, and releases the rider so
   * dispatch capacity is not pinned BUSY by a finished order.
   */
  async adminReconcileDeliveredOrder(
    deliveryJobId: string,
    actor: Actor,
    input: AdminReconcileOrderDto,
    idempotencyKey?: string,
  ) {
    if (actor.role !== Role.ADMIN) {
      throw new ForbiddenException("Only an administrator can reconcile a delivery job");
    }
    const reason = input.reason.trim();
    const key = idempotencyKey || `admin-reconcile-job:${deliveryJobId}`;
    return prisma.$transaction(async (tx) => {
      await this.lock(tx, `delivery-reconcile:${deliveryJobId}`);
      const job = await this.job(tx, deliveryJobId);
      if (job.status === DeliveryJobStatus.DELIVERED) {
        await this.reconcileSubscriptionAfterDelivery(tx, job, actor);
        return job;
      }
      if ([DeliveryJobStatus.CANCELLED, DeliveryJobStatus.RETURNED_TO_STORE].includes(job.status)) {
        throw new ConflictException(`Cannot reconcile delivery from ${job.status}`);
      }
      if (job.order.status !== OrderStatus.DELIVERED) {
        throw new ConflictException(`Order is ${job.order.status}; use admin force-complete to deliver it`);
      }
      if (!job.currentRiderId) {
        throw new BadRequestException("Delivery has no assigned Rider");
      }

      const now = new Date();
      await tx.dispatchAssignment.updateMany({
        where: {
          deliveryJobId,
          status: { in: ["CREATED", "OFFERED", "ACCEPTED"] },
        },
        data: { status: "CANCELLED", respondedAt: now },
      });
      const proof = job.deliveryProof || await tx.deliveryProof.create({
        data: {
          deliveryJobId,
          orderId: job.orderId,
          riderId: job.currentRiderId,
          customerUserId: job.order.customerId,
          verificationMethod: "SECURITY_RECEPTION",
          proofReference: key,
          riderConfirmedAt: now,
          verifiedAt: now,
          note: `ADMIN RECONCILE: ${reason}`,
        },
      });
      await this.createOperation(tx, {
        deliveryJobId,
        orderId: job.orderId,
        type: "DELIVERY_PROOF_RECORDED",
        actor,
        idempotencyKey: key,
        details: { adminOverride: true, reconcile: true, reason, deliveryProofId: proof.id },
      });
      const changed = await tx.deliveryJob.updateMany({
        where: { id: deliveryJobId, status: job.status, version: job.version },
        data: { status: DeliveryJobStatus.DELIVERED, version: { increment: 1 } },
      });
      if (changed.count !== 1) {
        throw new ConflictException("Delivery job was updated by another request");
      }
      if (job.currentRiderId) {
        await reconcileRiderOperationalStatus(tx, job.currentRiderId);
      }
      await this.reconcileSubscriptionAfterDelivery(tx, job, actor);
      return tx.deliveryJob.findUnique({ where: { id: deliveryJobId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

}
