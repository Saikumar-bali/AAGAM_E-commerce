/**
 * Delivery failure recording, retry and resolution.
 *
 * Split out of the former delivery-operations.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, ForbiddenException, NotFoundException, Injectable } from "@nestjs/common";
import { DeliveryResolutionAction, DeliveryResolutionStatus, PaymentMethod, PaymentStatus, Prisma, Role, prisma } from "@aagam/database";
import { DeliveryJobStatus } from "@aagam/types";
import { randomUUID } from "crypto";
import { RecordDeliveryFailureDto, ResolveDeliveryFailureDto } from "./delivery-operations.dto";
import { Actor, FAILURE_STATUSES } from "./delivery-operations.types";
import { decideFailureResolution, FAILURE_POLICY_VERSION } from "./delivery-failure-policy";
import { DeliveryOperationsBase } from "./delivery-operations.base";
import { DeliveryWorkflowService } from "./delivery-workflow.service";
import { OutboxService } from "../notifications/outbox.service";
import { SubscriptionCashFundingService } from "../subscriptions/subscription-cash-funding.service";

@Injectable()
export class DeliveryOperationsFailureService extends DeliveryOperationsBase {
  constructor(
    workflow: DeliveryWorkflowService,
    outbox: OutboxService,
    subscriptionFunding: SubscriptionCashFundingService
  ) {
    super(workflow, outbox, subscriptionFunding);
  }

  async recordFailure(
    deliveryJobId: string,
    actor: Actor,
    input: RecordDeliveryFailureDto,
    idempotencyKey?: string
  ) {
    return prisma.$transaction(
      async (tx) => {
        await this.lock(tx, `delivery-failure:${deliveryJobId}`);
        const key =
          idempotencyKey || `delivery-failure:${deliveryJobId}:${randomUUID()}`;
        const existing = await this.findOperationByKey(tx, key);
        if (existing)
          return {
            operation: existing,
            job: await this.job(tx, deliveryJobId),
          };

        const job = await this.job(tx, deliveryJobId);
        this.assertRiderOrAdmin(job, actor);
        if (!FAILURE_STATUSES.has(job.status)) {
          throw new BadRequestException(
            `Delivery failure cannot be recorded from ${job.status}`
          );
        }

        const changed = await this.workflow.transitionWithinTransaction(
          tx,
          deliveryJobId,
          DeliveryJobStatus.DELIVERY_FAILED,
          actor,
          {
            expectedStatus: job.status,
            metadata: {
              failureReason: input.reason,
              failureNote: input.note,
              phase3Operation: true,
            },
          }
        );
        const operation = await this.createOperation(tx, {
          deliveryJobId,
          orderId: job.orderId,
          type: "DELIVERY_FAILURE_RECORDED",
          actor,
          idempotencyKey: key,
          details: {
            reason: input.reason,
            note: input.note || null,
            fromStatus: job.status,
          },
        });
        const policy = decideFailureResolution(input.reason);
        const decision = await tx.deliveryFailureDecision.create({
          data: {
            deliveryJobId,
            orderId: job.orderId,
            failureOperationId: operation.id,
            reason: input.reason,
            recommendedAction: policy.action,
            decidedAction: policy.action,
            status: DeliveryResolutionStatus.DECIDED,
            policyVersion: FAILURE_POLICY_VERSION,
            rationale: policy.rationale,
          },
        });
        await this.createOperation(tx, {
          deliveryJobId,
          orderId: job.orderId,
          type: "FAILURE_RESOLUTION_DECIDED",
          actor: null,
          idempotencyKey: `failure-decision:${decision.id}`,
          details: {
            decisionId: decision.id,
            reason: input.reason,
            recommendedAction: policy.action,
            decidedAction: policy.action,
            policyVersion: FAILURE_POLICY_VERSION,
            rationale: policy.rationale,
          },
        });
        await this.notify(
          tx,
          job,
          actor,
          "DELIVERY_FAILED",
          "Delivery attempt unsuccessful",
          `Order #${job.orderId
            .slice(-8)
            .toUpperCase()} could not be delivered: ${input.reason
            .replaceAll("_", " ")
            .toLowerCase()}.`,
          operation,
          { failureReason: input.reason }
        );
        return { operation, decision, job: changed };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  async retryFailedDelivery(
    deliveryJobId: string,
    actor: Actor,
    idempotencyKey?: string
  ) {
    return prisma.$transaction(
      async (tx) => {
        await this.lock(tx, `delivery-retry:${deliveryJobId}`);
        const key = idempotencyKey || `delivery-retry:${deliveryJobId}`;
        const existing = await this.findOperationByKey(tx, key);
        if (existing) return { operation: existing, job: await this.job(tx, deliveryJobId) };
        const job = await this.job(tx, deliveryJobId);
        this.assertRiderOrAdmin(job, actor);
        if (job.status === DeliveryJobStatus.OUT_FOR_DELIVERY) return { operation: null, job };
        if (job.status !== DeliveryJobStatus.DELIVERY_FAILED) {
          throw new BadRequestException('Only a failed delivery can be retried');
        }
        const decision = await tx.deliveryFailureDecision.findFirst({
          where: {
            deliveryJobId,
            status: { in: [DeliveryResolutionStatus.DECIDED, DeliveryResolutionStatus.IN_PROGRESS] },
          },
          orderBy: { createdAt: 'desc' },
        });
        if (!decision || decision.decidedAction !== DeliveryResolutionAction.RETRY_DELIVERY) {
          throw new BadRequestException(
            `System resolution is ${decision?.decidedAction || 'not available'}; retry is not authorized`
          );
        }
        const changed = await this.workflow.transitionWithinTransaction(
          tx,
          deliveryJobId,
          DeliveryJobStatus.OUT_FOR_DELIVERY,
          actor,
          {
            expectedStatus: DeliveryJobStatus.DELIVERY_FAILED,
            skipRoleCheck: true,
            metadata: { failureDecisionId: decision.id, routeRetry: true },
          }
        );
        const operation = await this.createOperation(tx, {
          deliveryJobId,
          orderId: job.orderId,
          type: 'FAILURE_RESOLUTION_APPLIED',
          actor,
          idempotencyKey: key,
          details: {
            decisionId: decision.id,
            action: DeliveryResolutionAction.RETRY_DELIVERY,
            appliedAt: new Date().toISOString(),
          },
        });
        await tx.deliveryFailureDecision.update({
          where: { id: decision.id },
          data: {
            status: DeliveryResolutionStatus.IN_PROGRESS,
            appliedByUserId: actor.id,
            appliedAt: new Date(),
          },
        });
        return { operation, job: changed };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  async resolveFailure(
    deliveryJobId: string,
    actor: Actor,
    input: ResolveDeliveryFailureDto,
    idempotencyKey?: string
  ) {
    if (actor.role !== Role.ADMIN) {
      throw new ForbiddenException(
        "Only an administrator can apply or override a failure resolution"
      );
    }
    return prisma.$transaction(
      async (tx) => {
        await this.lock(tx, `delivery-failure-resolution:${deliveryJobId}`);
        const key =
          idempotencyKey ||
          `failure-resolution:${deliveryJobId}:${randomUUID()}`;
        const existingOperation = await this.findOperationByKey(tx, key);
        if (existingOperation) {
          return {
            operation: existingOperation,
            decision: await tx.deliveryFailureDecision.findFirst({
              where: { deliveryJobId },
              orderBy: { createdAt: "desc" },
            }),
            job: await this.job(tx, deliveryJobId),
          };
        }
        const job = await this.job(tx, deliveryJobId);
        if (job.status !== DeliveryJobStatus.DELIVERY_FAILED) {
          throw new BadRequestException(
            "Failure resolution requires a failed delivery"
          );
        }
        const decision = await tx.deliveryFailureDecision.findFirst({
          where: {
            deliveryJobId,
            status: {
              in: [
                DeliveryResolutionStatus.DECIDED,
                DeliveryResolutionStatus.IN_PROGRESS,
              ],
            },
          },
          orderBy: { createdAt: "desc" },
        });
        if (!decision)
          throw new NotFoundException(
            "No active failure resolution decision exists"
          );
        const action = (input.action ||
          decision.decidedAction) as DeliveryResolutionAction;
        const overridden = action !== decision.recommendedAction;
        if (overridden && !input.overrideReason) {
          throw new BadRequestException(
            "An override reason is required when changing the system recommendation"
          );
        }

        let changed: any = job;
        let resolutionStatus: DeliveryResolutionStatus =
          DeliveryResolutionStatus.COMPLETED;
        if (action === DeliveryResolutionAction.RETRY_DELIVERY) {
          changed = await this.workflow.transitionWithinTransaction(
            tx,
            deliveryJobId,
            DeliveryJobStatus.OUT_FOR_DELIVERY,
            actor,
            {
              expectedStatus: DeliveryJobStatus.DELIVERY_FAILED,
              skipRoleCheck: true,
              metadata: { phase5FailureDecisionId: decision.id },
            }
          );
      } else if (action === DeliveryResolutionAction.REASSIGN_RIDER) {
          const ledger = await tx.codLedger.findUnique({
            where: { deliveryJobId },
          });
        if (ledger && ledger.riderHoldingBalancePaise > 0) {
            throw new BadRequestException(
              "A Rider holding COD cash cannot be reassigned until cash is reconciled"
            );
        }
        const assignment = await tx.dispatchAssignment.findFirst({
          where: { deliveryJobId, status: "ACCEPTED" },
          orderBy: { createdAt: "desc" },
        });
        if (assignment) {
          await tx.dispatchAssignment.update({
            where: { id: assignment.id },
            data: { status: "REASSIGNED", respondedAt: new Date() },
          });
          await tx.deliveryEvent.create({
            data: {
              deliveryJobId,
              assignmentId: assignment.id,
              eventType: "ASSIGNMENT_REASSIGNED",
              actorUserId: actor.id,
              actorRole: actor.role,
              metadata: { phase5FailureDecisionId: decision.id },
            },
          });
        }
        changed = await this.workflow.transitionWithinTransaction(
            tx,
            deliveryJobId,
            DeliveryJobStatus.WAITING_FOR_DISPATCH,
            actor,
            {
              expectedStatus: DeliveryJobStatus.DELIVERY_FAILED,
              skipRoleCheck: true,
              metadata: { phase5FailureDecisionId: decision.id },
            }
          );
        } else if (action === DeliveryResolutionAction.RETURN_TO_STORE) {
          changed = await this.workflow.transitionWithinTransaction(
            tx,
            deliveryJobId,
            DeliveryJobStatus.RETURNING_TO_STORE,
            actor,
            {
              expectedStatus: DeliveryJobStatus.DELIVERY_FAILED,
              skipRoleCheck: true,
              metadata: { phase5FailureDecisionId: decision.id },
            }
          );
          await this.createOperation(tx, {
            deliveryJobId,
            orderId: job.orderId,
            type: "RETURN_STARTED",
            actor,
            idempotencyKey: `return-start:decision:${decision.id}`,
            details: {
              decisionId: decision.id,
              startedAt: new Date().toISOString(),
            },
          });
        } else if (action === DeliveryResolutionAction.CANCEL_AND_REFUND) {
          const ledger = await tx.codLedger.findUnique({
            where: { deliveryJobId },
          });
          if (ledger && ledger.riderHoldingBalancePaise > 0) {
            throw new BadRequestException(
              "COD held by the Rider must be deposited or reconciled before cancellation"
            );
          }
          const payment = job.order.payment;
          if (
            payment?.method === PaymentMethod.ONLINE &&
            payment.status === PaymentStatus.CAPTURED
          ) {
            const existingRefund = await tx.refund.findFirst({
              where: {
                paymentId: payment.id,
                amountPaise: payment.amountPaise,
              },
            });
            if (!existingRefund) {
              await tx.refund.create({
                data: {
                  orderId: job.orderId,
                  paymentId: payment.id,
                  amountPaise: payment.amountPaise,
                  status: "PENDING",
                  reason: `Phase 5 failed-delivery resolution ${decision.id}`,
                  requestedByUserId: actor.id,
                },
              });
            }
            await tx.payment.update({
              where: { id: payment.id },
              data: { status: PaymentStatus.REFUND_PENDING },
            });
          }
          changed = await this.workflow.transitionWithinTransaction(
            tx,
            deliveryJobId,
            DeliveryJobStatus.CANCELLED,
            actor,
            {
              expectedStatus: DeliveryJobStatus.DELIVERY_FAILED,
              skipRoleCheck: true,
              metadata: { phase5FailureDecisionId: decision.id },
            }
          );
        } else {
          resolutionStatus = DeliveryResolutionStatus.IN_PROGRESS;
        }

        const appliedAt = new Date();
        const updatedDecision = await tx.deliveryFailureDecision.update({
          where: { id: decision.id },
          data: {
            decidedAction: action,
            status: resolutionStatus,
            overriddenByUserId: overridden ? actor.id : null,
            overrideReason: overridden ? input.overrideReason : null,
            appliedByUserId: actor.id,
            appliedAt,
          },
        });
        const operation = await this.createOperation(tx, {
          deliveryJobId,
          orderId: job.orderId,
          type: "FAILURE_RESOLUTION_APPLIED",
          actor,
          idempotencyKey: key,
          details: {
            decisionId: decision.id,
            action,
            systemRecommendation: decision.recommendedAction,
            overridden,
            overrideReason: input.overrideReason || null,
            resolutionStatus,
            appliedAt: appliedAt.toISOString(),
          },
        });
        return { operation, decision: updatedDecision, job: changed };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

}
