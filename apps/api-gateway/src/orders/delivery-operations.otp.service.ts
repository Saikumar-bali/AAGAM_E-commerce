/**
 * Customer delivery OTP issuance and lookup.
 *
 * Split out of the former delivery-operations.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, ConflictException, NotFoundException, Injectable } from "@nestjs/common";
import { Prisma, prisma } from "@aagam/database";
import { DeliveryJobStatus } from "@aagam/types";
import { randomBytes, randomUUID } from "crypto";
import { Actor, DeliveryOperationType, DeliveryOperationStatus, OTP_TTL_MS, OTP_MAX_ATTEMPTS } from "./delivery-operations.types";
import { DeliveryOperationsBase } from "./delivery-operations.base";
import { DeliveryWorkflowService } from "./delivery-workflow.service";
import { OutboxService } from "../notifications/outbox.service";
import { SubscriptionCashFundingService } from "../subscriptions/subscription-cash-funding.service";

@Injectable()
export class DeliveryOperationsOtpService extends DeliveryOperationsBase {
  constructor(
    workflow: DeliveryWorkflowService,
    outbox: OutboxService,
    subscriptionFunding: SubscriptionCashFundingService
  ) {
    super(workflow, outbox, subscriptionFunding);
  }

  async issueOtp(deliveryJobId: string, actor: Actor, idempotencyKey?: string) {
    const result = await prisma.$transaction(
      async (tx) => {
        await this.lock(tx, `delivery-otp:${deliveryJobId}`);
        const job = await this.job(tx, deliveryJobId);
        this.assertRiderOrAdmin(job, actor);
        if (job.status !== DeliveryJobStatus.RIDER_AT_CUSTOMER) {
          throw new BadRequestException(
            "Delivery OTP can be issued only after the rider arrives at the customer"
          );
        }

        const key =
          idempotencyKey || `otp-issued:${deliveryJobId}:${randomUUID()}`;
        const existing = await this.findOperationByKey(tx, key);
        if (existing) {
          if (
            existing.deliveryJobId !== deliveryJobId ||
            existing.type !== "OTP_ISSUED"
          ) {
            throw new ConflictException(
              "Idempotency key is already used by another operation"
            );
          }
          return {
            operation: existing,
            expiresAt: new Date(String(existing.details?.expiresAt)),
          };
        }

        await tx.$executeRaw(Prisma.sql`
        UPDATE "DeliveryOperation"
        SET "status" = 'SUPERSEDED'::"DeliveryOperationStatus",
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "deliveryJobId" = ${deliveryJobId}
          AND "type" = 'OTP_ISSUED'::"DeliveryOperationType"
          AND "status" = 'PENDING'::"DeliveryOperationStatus"
      `);

        const nonce = randomBytes(24).toString("hex");
        const salt = randomBytes(16).toString("hex");
        const code = this.otpCode(deliveryJobId, nonce);
        const expiresAt = new Date(Date.now() + OTP_TTL_MS);
        const operation = await this.createOperation(tx, {
          deliveryJobId,
          orderId: job.orderId,
          type: "OTP_ISSUED",
          status: "PENDING",
          actor,
          idempotencyKey: key,
          details: {
            nonce,
            salt,
            codeHash: this.otpHash(code, salt),
            expiresAt: expiresAt.toISOString(),
            maxAttempts: OTP_MAX_ATTEMPTS,
          },
        });
        await this.notify(
          tx,
          job,
          actor,
          "RIDER_AT_CUSTOMER",
          "Delivery verification code ready",
          `Your verification code for order #${job.orderId
            .slice(-8)
            .toUpperCase()} is ready in the order screen.`,
          operation
        );
        return { operation, expiresAt };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    return {
      issued: result.operation.status === "PENDING",
      operationId: result.operation.id,
      expiresAt: result.expiresAt,
      maxAttempts: OTP_MAX_ATTEMPTS,
    };
  }

  async getCustomerOtp(deliveryJobId: string, actor: Actor) {
    const job = await this.job(prisma, deliveryJobId);
    this.assertCustomerOrAdmin(job, actor);
    const issue = await this.latestOperation(
      prisma,
      deliveryJobId,
      "OTP_ISSUED",
      ["PENDING"]
    );
    if (!issue) throw new NotFoundException("No active delivery OTP exists");
    const expiresAt = new Date(String(issue.details?.expiresAt));
    if (
      !Number.isFinite(expiresAt.getTime()) ||
      expiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException(
        "Delivery OTP expired. Ask the rider to issue a new code."
      );
    }
    return {
      code: this.otpCode(deliveryJobId, String(issue.details.nonce)),
      expiresAt,
      orderId: job.orderId,
    };
  }

}
