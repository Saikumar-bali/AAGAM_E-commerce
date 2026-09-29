/**
 * Delivery-operation summary and queue reads.
 *
 * Split out of the former delivery-operations.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { ForbiddenException, Injectable } from "@nestjs/common";
import { PaymentMethod, PaymentStatus, Role, prisma } from "@aagam/database";
import { Actor, DeliveryOperationRow, OTP_MAX_ATTEMPTS } from "./delivery-operations.types";
import { DeliveryOperationsBase } from "./delivery-operations.base";
import { DeliveryWorkflowService } from "./delivery-workflow.service";
import { OutboxService } from "../notifications/outbox.service";
import { SubscriptionCashFundingService } from "../subscriptions/subscription-cash-funding.service";

@Injectable()
export class DeliveryOperationsQueryService extends DeliveryOperationsBase {
  constructor(
    workflow: DeliveryWorkflowService,
    outbox: OutboxService,
    subscriptionFunding: SubscriptionCashFundingService
  ) {
    super(workflow, outbox, subscriptionFunding);
  }

  async getSummary(deliveryJobId: string, actor: Actor) {
    const job = await this.job(prisma, deliveryJobId);
    if (actor.role === Role.RIDER) this.assertRiderOrAdmin(job, actor);
    else if (actor.role === Role.STORE_OWNER)
      this.assertStoreOrAdmin(job, actor);
    else if (actor.role === Role.CUSTOMER)
      this.assertCustomerOrAdmin(job, actor);
    else if (actor.role !== Role.ADMIN)
      throw new ForbiddenException("Role cannot access delivery operations");

    const operations = (await this.listOperations(prisma, deliveryJobId)).map(
      (operation) => this.publicOperation(operation)
    );
    const activeOtp = operations.find(
      (operation: DeliveryOperationRow) =>
        operation.type === "OTP_ISSUED" && operation.status === "PENDING"
    );
    const codCollected = operations.find(
      (operation: DeliveryOperationRow) =>
        operation.type === "COD_COLLECTED" && operation.status === "COMPLETED"
    );
    const codSettled = operations.find(
      (operation: DeliveryOperationRow) =>
        operation.type === "COD_SETTLED" && operation.status === "COMPLETED"
    );
    const inspection = operations.find(
      (operation: DeliveryOperationRow) =>
        operation.type === "RETURN_INSPECTION_COMPLETED" &&
        operation.status === "COMPLETED"
    );

    return {
      job,
      operations,
      requirements: {
        deliveryOtpRequired: true,
        codCollectionRequired: job.order.payment?.method === PaymentMethod.COD,
      },
      otp: activeOtp
        ? {
            issued: true,
            operationId: activeOtp.id,
            expiresAt: activeOtp.details?.expiresAt || null,
            maxAttempts: activeOtp.details?.maxAttempts || OTP_MAX_ATTEMPTS,
          }
        : { issued: false },
      cod: {
        applicable: job.order.payment?.method === PaymentMethod.COD,
        expectedAmountPaise:
          job.order.payment?.amountPaise || job.order.grandTotalPaise,
        collected: Boolean(codCollected),
        settled: Boolean(codSettled),
        ledger: job.codLedger || null,
      },
      pickupProof: job.pickupProof || null,
      deliveryProof: job.deliveryProof || null,
      failureDecision: job.failureDecisions?.[0] || null,
      returnInspection: inspection || null,
    };
  }

  async getQueue(actor: Actor) {
    if (actor.role !== Role.ADMIN && actor.role !== Role.STORE_OWNER) {
      throw new ForbiddenException(
        "Only admin and store owners can view the delivery operations queue"
      );
    }
    const storeFilter =
      actor.role === Role.STORE_OWNER
        ? { order: { store: { ownerId: actor.id } } }
        : {};
    const jobs = await prisma.deliveryJob.findMany({
      where: {
        ...storeFilter,
        OR: [
          { status: "RIDER_AT_STORE" as any },
          {
            status: {
              in: [
                "DELIVERY_FAILED",
                "RETURNING_TO_STORE",
                "RETURNED_TO_STORE",
              ] as any,
            },
          },
          {
            order: {
              payment: {
                is: {
                  method: PaymentMethod.COD,
                  status: {
                    in: [PaymentStatus.PENDING_COD, PaymentStatus.CAPTURED],
                  },
                },
              },
            },
          },
        ],
      } as any,
      include: {
        currentRider: {
          include: { user: { select: { id: true, name: true, email: true, phone: true } } },
        },
        pickupProof: true,
        deliveryProof: true,
        codLedger: { include: { entries: { orderBy: { createdAt: "asc" } } } },
        failureDecisions: { orderBy: { createdAt: "desc" }, take: 10 },
        order: {
          include: {
            customer: { select: { id: true, name: true, email: true } },
            store: { select: { id: true, name: true, ownerId: true } },
            payment: true,
            items: { include: { product: true } },
            subscription: { select: { id: true, deliveryMethod: true, dropPointTokenHash: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    return Promise.all(
      jobs.map(async (job: any) => ({
        ...job,
        operations: (await this.listOperations(prisma, job.id)).map(
          (operation) => this.publicOperation(operation)
        ),
      }))
    );
  }

}
