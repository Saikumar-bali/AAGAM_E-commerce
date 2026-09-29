/**
 * Store handoff and pickup-proof gates.
 *
 * Split out of the former delivery-operations.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, NotFoundException, Injectable } from "@nestjs/common";
import { PickupChallengeStatus, PickupVerificationMethod, Prisma, Role, prisma } from "@aagam/database";
import { DeliveryJobStatus } from "@aagam/types";
import { randomBytes, timingSafeEqual } from "crypto";
import { ConfirmStoreHandoffDto, IssuePickupChallengeDto, PickupVerificationMethodDto, VerifyPickupProofDto } from "./delivery-operations.dto";
import { Actor, DbClient, PICKUP_TTL_MS, PICKUP_MAX_ATTEMPTS } from "./delivery-operations.types";
import { DeliveryOperationsBase } from "./delivery-operations.base";
import { DeliveryWorkflowService } from "./delivery-workflow.service";
import { OutboxService } from "../notifications/outbox.service";
import { SubscriptionCashFundingService } from "../subscriptions/subscription-cash-funding.service";

@Injectable()
export class DeliveryOperationsPickupService extends DeliveryOperationsBase {
  constructor(
    workflow: DeliveryWorkflowService,
    outbox: OutboxService,
    subscriptionFunding: SubscriptionCashFundingService
  ) {
    super(workflow, outbox, subscriptionFunding);
  }

  private async assertPickupChecklist(tx: DbClient, job: any) {
    const task = await tx.riderPickupTask.findUnique({
      where: { deliveryJobId: job.id },
    });
    if (!task || task.status !== "VERIFIED") {
      throw new BadRequestException(
        "The Rider item and parcel checklist must be verified before handoff"
      );
    }
    return task;
  }

  async issuePickupChallenge(
    deliveryJobId: string,
    actor: Actor,
    input: IssuePickupChallengeDto
  ) {
    if (actor.role !== Role.STORE_OWNER) {
      throw new ForbiddenException(
        "Only the owning store user can issue pickup PIN or QR proof"
      );
    }
    if (input.method === PickupVerificationMethodDto.STORE_CONFIRMED_HANDOFF) {
      throw new BadRequestException(
        "Store-confirmed handoff does not use a challenge"
      );
    }
    return prisma.$transaction(
      async (tx) => {
        await this.lock(tx, `pickup-proof:${deliveryJobId}`);
        const job = await this.job(tx, deliveryJobId);
        this.assertStoreOrAdmin(job, actor);
        if (
          job.status !== DeliveryJobStatus.RIDER_AT_STORE ||
          !job.currentRiderId
        ) {
          throw new BadRequestException(
            "Pickup proof is available only while the assigned Rider is at the store"
          );
        }
        await this.assertPickupChecklist(tx, job);
        if (job.pickupProof)
          throw new ConflictException("Pickup handoff is already verified");

        await tx.pickupChallenge.updateMany({
          where: { deliveryJobId, status: PickupChallengeStatus.PENDING },
          data: { status: PickupChallengeStatus.SUPERSEDED },
        });
        const method = input.method as PickupVerificationMethod;
        const code = this.pickupCode(method);
        const salt = randomBytes(16).toString("hex");
        const expiresAt = new Date(Date.now() + PICKUP_TTL_MS);
        const challenge = await tx.pickupChallenge.create({
          data: {
            deliveryJobId,
            method,
            codeHash: this.pickupHash(code, salt),
            salt,
            issuedByStoreUserId: actor.id,
            parcelCount: input.parcelCount,
            expiresAt,
          },
        });
        await this.createOperation(tx, {
          deliveryJobId,
          orderId: job.orderId,
          type: "PICKUP_CHALLENGE_ISSUED",
          actor,
          idempotencyKey: `pickup-challenge:${challenge.id}`,
          details: {
            challengeId: challenge.id,
            method,
            parcelCount: input.parcelCount,
            expiresAt: expiresAt.toISOString(),
          },
        });
        return {
          challengeId: challenge.id,
          method,
          code,
          expiresAt,
          parcelCount: input.parcelCount,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  private async recordPickupProof(
    tx: DbClient,
    job: any,
    actor: Actor,
    input: {
      method: PickupVerificationMethod;
      parcelCount: number;
      storeUserId: string;
      challengeId?: string;
      latitude?: number;
      longitude?: number;
      accuracyMetres?: number;
    }
  ) {
    this.assertCoordinates(input.latitude, input.longitude);
    if (!job.currentRiderId)
      throw new BadRequestException("Delivery has no assigned Rider");
    const existing = await tx.pickupProof.findUnique({
      where: { deliveryJobId: job.id },
    });
    if (existing) return existing;
    const verifiedAt = new Date();
    const proof = await tx.pickupProof.create({
      data: {
        deliveryJobId: job.id,
        orderId: job.orderId,
        riderId: job.currentRiderId,
        storeUserId: input.storeUserId,
        verifiedAt,
        latitude: input.latitude,
        longitude: input.longitude,
        accuracyMetres: input.accuracyMetres,
        parcelCount: input.parcelCount,
        verificationMethod: input.method,
        challengeId: input.challengeId,
      },
    });
    await this.workflow.transitionWithinTransaction(
      tx,
      job.id,
      DeliveryJobStatus.PICKUP_VERIFIED,
      actor,
      {
        expectedStatus: DeliveryJobStatus.RIDER_AT_STORE,
        skipRoleCheck: true,
        metadata: {
          phase5ProofId: proof.id,
          pickupVerificationMethod: input.method,
          parcelCount: input.parcelCount,
          storeUserId: input.storeUserId,
          coordinatesRecorded: input.latitude != null,
        },
      }
    );
    await this.createOperation(tx, {
      deliveryJobId: job.id,
      orderId: job.orderId,
      type: "PICKUP_VERIFIED",
      actor,
      idempotencyKey: `pickup-proof:${job.id}`,
      details: {
        pickupProofId: proof.id,
        riderId: job.currentRiderId,
        storeUserId: input.storeUserId,
        verifiedAt: verifiedAt.toISOString(),
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        accuracyMetres: input.accuracyMetres ?? null,
        parcelCount: input.parcelCount,
        verificationMethod: input.method,
      },
    });
    return proof;
  }

  async verifyPickupChallenge(
    deliveryJobId: string,
    actor: Actor,
    input: VerifyPickupProofDto
  ) {
    const outcome = await prisma.$transaction(
      async (tx) => {
        await this.lock(tx, `pickup-proof:${deliveryJobId}`);
        const job = await this.job(tx, deliveryJobId);
        this.assertRiderOrAdmin(job, actor);
        if (actor.role !== Role.RIDER) {
          throw new ForbiddenException(
            "The assigned Rider must verify a pickup PIN or QR code"
          );
        }
        if (job.status !== DeliveryJobStatus.RIDER_AT_STORE) {
          throw new BadRequestException(
            "Pickup proof is available only at the store"
          );
        }
        await this.assertPickupChecklist(tx, job);
        const method = input.method as PickupVerificationMethod;
        if (method === PickupVerificationMethod.STORE_CONFIRMED_HANDOFF) {
          throw new BadRequestException(
            "Store-confirmed handoff must be submitted by the owning store"
          );
        }
        const challenge = await tx.pickupChallenge.findFirst({
          where: {
            deliveryJobId,
            method,
            status: PickupChallengeStatus.PENDING,
          },
          orderBy: { createdAt: "desc" },
        });
        if (!challenge)
          throw new NotFoundException("No active pickup challenge exists");
        if (challenge.expiresAt.getTime() <= Date.now()) {
          await tx.pickupChallenge.update({
            where: { id: challenge.id },
            data: { status: PickupChallengeStatus.EXPIRED },
          });
          return {
            error: {
              reason: "Pickup challenge expired",
              attempts: challenge.attempts,
            },
          };
        }
        if (challenge.parcelCount !== input.parcelCount) {
          throw new BadRequestException(
            `Parcel count must equal ${challenge.parcelCount}`
          );
        }
        const supplied = this.pickupHash(input.code, challenge.salt);
        const valid =
          supplied.length === challenge.codeHash.length &&
          timingSafeEqual(
            Buffer.from(supplied, "hex"),
            Buffer.from(challenge.codeHash, "hex")
          );
        if (!valid) {
          const attempts = challenge.attempts + 1;
          await tx.pickupChallenge.update({
            where: { id: challenge.id },
            data: {
              attempts,
              status:
                attempts >= PICKUP_MAX_ATTEMPTS
                  ? PickupChallengeStatus.FAILED
                  : PickupChallengeStatus.PENDING,
            },
          });
          return {
            error: {
              reason:
                attempts >= PICKUP_MAX_ATTEMPTS
                  ? "Pickup challenge attempt limit reached"
                  : "Pickup PIN or QR code is incorrect",
              attempts,
            },
          };
        }
        const proof = await this.recordPickupProof(tx, job, actor, {
          method,
          parcelCount: input.parcelCount,
          storeUserId: challenge.issuedByStoreUserId,
          challengeId: challenge.id,
          latitude: input.latitude,
          longitude: input.longitude,
          accuracyMetres: input.accuracyMetres,
        });
        await tx.pickupChallenge.update({
          where: { id: challenge.id },
          data: { status: PickupChallengeStatus.USED, usedAt: new Date() },
        });
        return { proof };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
    if ("error" in outcome && outcome.error) {
      if (outcome.error.attempts >= PICKUP_MAX_ATTEMPTS) {
        throw new HttpException(
          outcome.error.reason,
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
      throw new BadRequestException(outcome.error.reason);
    }
    return outcome.proof;
  }

  async confirmStorePickup(
    deliveryJobId: string,
    actor: Actor,
    input: ConfirmStoreHandoffDto
  ) {
    if (actor.role !== Role.STORE_OWNER) {
      throw new ForbiddenException(
        "Only the owning store user can confirm physical handoff"
      );
    }
    return prisma.$transaction(
      async (tx) => {
        await this.lock(tx, `pickup-proof:${deliveryJobId}`);
        const job = await this.job(tx, deliveryJobId);
        this.assertStoreOrAdmin(job, actor);
        if (job.status !== DeliveryJobStatus.RIDER_AT_STORE) {
          throw new BadRequestException(
            "Store handoff can be confirmed only while the Rider is at the store"
          );
        }
        await this.assertPickupChecklist(tx, job);
        return this.recordPickupProof(tx, job, actor, {
          method: PickupVerificationMethod.STORE_CONFIRMED_HANDOFF,
          parcelCount: input.parcelCount,
          storeUserId: actor.id,
          latitude: input.latitude,
          longitude: input.longitude,
          accuracyMetres: input.accuracyMetres,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

}
