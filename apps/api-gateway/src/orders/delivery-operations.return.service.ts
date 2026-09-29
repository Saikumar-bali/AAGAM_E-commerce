/**
 * Return-to-store lifecycle.
 *
 * Split out of the former delivery-operations.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { DeliveryResolutionAction, DeliveryResolutionStatus, Prisma, prisma } from "@aagam/database";
import { DeliveryJobStatus } from "@aagam/types";
import { randomUUID } from "crypto";
import { ReturnDisposition, ReturnInspectionDto } from "./delivery-operations.dto";
import { Actor } from "./delivery-operations.types";
import { DeliveryOperationsBase } from "./delivery-operations.base";
import { DeliveryWorkflowService } from "./delivery-workflow.service";
import { OutboxService } from "../notifications/outbox.service";
import { SubscriptionCashFundingService } from "../subscriptions/subscription-cash-funding.service";

@Injectable()
export class DeliveryOperationsReturnService extends DeliveryOperationsBase {
  constructor(
    workflow: DeliveryWorkflowService,
    outbox: OutboxService,
    subscriptionFunding: SubscriptionCashFundingService
  ) {
    super(workflow, outbox, subscriptionFunding);
  }

  async startReturn(
    deliveryJobId: string,
    actor: Actor,
    idempotencyKey?: string
  ) {
    return prisma.$transaction(
      async (tx) => {
        await this.lock(tx, `delivery-return:${deliveryJobId}`);
        const key =
          idempotencyKey || `return-start:${deliveryJobId}:${randomUUID()}`;
        const existing = await this.findOperationByKey(tx, key);
        if (existing)
          return {
            operation: existing,
            job: await this.job(tx, deliveryJobId),
          };
        const job = await this.job(tx, deliveryJobId);
        this.assertRiderOrAdmin(job, actor);
        if (job.status !== DeliveryJobStatus.DELIVERY_FAILED) {
          throw new BadRequestException(
            "Only a failed delivery can start returning to store"
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
        if (
          !decision ||
          decision.decidedAction !== DeliveryResolutionAction.RETURN_TO_STORE
        ) {
          throw new BadRequestException(
            `System resolution is ${
              decision?.decidedAction || "not available"
            }; return-to-store is not authorized`
          );
        }
        const changed = await this.workflow.transitionWithinTransaction(
          tx,
          deliveryJobId,
          DeliveryJobStatus.RETURNING_TO_STORE,
          actor,
          {
            expectedStatus: DeliveryJobStatus.DELIVERY_FAILED,
            metadata: { phase3Operation: true },
          }
        );
        const operation = await this.createOperation(tx, {
          deliveryJobId,
          orderId: job.orderId,
          type: "RETURN_STARTED",
          actor,
          idempotencyKey: key,
          details: {
            startedAt: new Date().toISOString(),
            decisionId: decision.id,
          },
        });
        await tx.deliveryFailureDecision.update({
          where: { id: decision.id },
          data: {
            status: DeliveryResolutionStatus.COMPLETED,
            appliedByUserId: actor.id,
            appliedAt: new Date(),
          },
        });
        await this.notify(
          tx,
          job,
          actor,
          "DELIVERY_FAILED",
          "Order returning to store",
          `Order #${job.orderId.slice(-8).toUpperCase()} is being returned to ${
            job.order.store.name
          }.`,
          operation
        );
        return { operation, job: changed };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  async confirmReturn(
    deliveryJobId: string,
    actor: Actor,
    idempotencyKey?: string
  ) {
    return prisma.$transaction(
      async (tx) => {
        await this.lock(tx, `delivery-return:${deliveryJobId}`);
        const key =
          idempotencyKey || `return-confirm:${deliveryJobId}:${randomUUID()}`;
        const existing = await this.findOperationByKey(tx, key);
        if (existing)
          return {
            operation: existing,
            job: await this.job(tx, deliveryJobId),
          };
        const job = await this.job(tx, deliveryJobId);
        this.assertStoreOrAdmin(job, actor);
        if (job.status !== DeliveryJobStatus.RETURNING_TO_STORE) {
          throw new BadRequestException(
            "The parcel must be returning to store before receipt is confirmed"
          );
        }
        const changed = await this.workflow.transitionWithinTransaction(
          tx,
          deliveryJobId,
          DeliveryJobStatus.RETURNED_TO_STORE,
          actor,
          {
            expectedStatus: DeliveryJobStatus.RETURNING_TO_STORE,
            skipRoleCheck: true,
            metadata: { phase3Operation: true, returnedConfirmedBy: actor.id },
          }
        );
        const operation = await this.createOperation(tx, {
          deliveryJobId,
          orderId: job.orderId,
          type: "RETURN_CONFIRMED",
          actor,
          idempotencyKey: key,
          details: { confirmedAt: new Date().toISOString() },
        });
        await this.notify(
          tx,
          job,
          actor,
          "DELIVERY_FAILED",
          "Returned parcel received",
          `${
            job.order.store.name
          } received the returned parcel for order #${job.orderId
            .slice(-8)
            .toUpperCase()}.`,
          operation
        );
        return { operation, job: changed };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  async inspectReturn(
    deliveryJobId: string,
    actor: Actor,
    input: ReturnInspectionDto,
    idempotencyKey?: string
  ) {
    return prisma.$transaction(
      async (tx) => {
        await this.lock(tx, `delivery-inspection:${deliveryJobId}`);
        const key = idempotencyKey || `return-inspection:${deliveryJobId}`;
        const existingByKey = await this.findOperationByKey(tx, key);
        if (existingByKey) return existingByKey;
        const prior = await this.latestOperation(
          tx,
          deliveryJobId,
          "RETURN_INSPECTION_COMPLETED",
          ["COMPLETED"]
        );
        if (prior)
          throw new ConflictException("Return inspection is already completed");

        const job = await this.job(tx, deliveryJobId);
        this.assertStoreOrAdmin(job, actor);
        if (job.status !== DeliveryJobStatus.RETURNED_TO_STORE) {
          throw new BadRequestException(
            "Return inspection requires a parcel confirmed at the store"
          );
        }

        const orderItems = job.order.items as Array<any>;
        const itemById = new Map(orderItems.map((item) => [item.id, item]));
        const grouped = new Map<
          string,
          { total: number; sellable: number; lines: any[] }
        >();
        for (const line of input.lines) {
          const item = itemById.get(line.orderItemId);
          if (!item)
            throw new BadRequestException(
              `Order item not found: ${line.orderItemId}`
            );
          const current = grouped.get(line.orderItemId) || {
            total: 0,
            sellable: 0,
            lines: [],
          };
          current.total += line.quantity;
          if (line.disposition === ReturnDisposition.SELLABLE)
            current.sellable += line.quantity;
          current.lines.push({
            ...line,
            productId: item.productId,
            productName: item.product?.name || null,
          });
          grouped.set(line.orderItemId, current);
        }

        if (grouped.size !== orderItems.length) {
          throw new BadRequestException(
            "Inspection must account for every ordered item"
          );
        }
        for (const item of orderItems) {
          const group = grouped.get(item.id);
          if (!group || group.total !== item.quantity) {
            throw new BadRequestException(
              `Inspection quantity for ${
                item.product?.name || item.id
              } must equal ${item.quantity}`
            );
          }
        }

        for (const item of orderItems) {
          const sellable = grouped.get(item.id)?.sellable || 0;
          if (sellable <= 0) continue;
          const existing = await tx.inventory.findUnique({
            where: {
              storeId_productId: {
                storeId: job.order.storeId,
                productId: item.productId,
              },
            },
          });
          const previousQuantity = existing?.quantity || 0;
          if (existing) {
            await tx.inventory.update({
              where: {
                storeId_productId: {
                  storeId: job.order.storeId,
                  productId: item.productId,
                },
              },
              data: { quantity: { increment: sellable } },
            });
          } else {
            await tx.inventory.create({
              data: {
                storeId: job.order.storeId,
                productId: item.productId,
                quantity: sellable,
              },
            });
          }
          await tx.inventoryLedger.create({
            data: {
              storeId: job.order.storeId,
              productId: item.productId,
              orderId: job.orderId,
              reason: "ORDER_CANCEL_RESTORE",
              quantityDelta: sellable,
              previousQuantity,
              newQuantity: previousQuantity + sellable,
              actorUserId: actor.id,
              note: `Returned delivery inspection restored ${sellable} sellable unit(s)`,
            },
          });
        }

        const lines = Array.from(grouped.values()).flatMap(
          (group) => group.lines
        );
        const operation = await this.createOperation(tx, {
          deliveryJobId,
          orderId: job.orderId,
          type: "RETURN_INSPECTION_COMPLETED",
          actor,
          idempotencyKey: key,
          details: {
            lines,
            note: input.note || null,
            inspectedAt: new Date().toISOString(),
          },
        });
        await this.notify(
          tx,
          job,
          actor,
          "DELIVERY_FAILED",
          "Return inspection completed",
          `The returned items for order #${job.orderId
            .slice(-8)
            .toUpperCase()} were inspected at ${job.order.store.name}.`,
          operation
        );
        return operation;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }
}
