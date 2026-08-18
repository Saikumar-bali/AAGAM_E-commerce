import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentMethod,
  PaymentStatus,
  Prisma,
  Role,
  prisma,
} from '@aagam/database';
import { DeliveryJobStatus } from '@aagam/types';
import { randomUUID } from 'crypto';
import { UploadService } from '../upload/upload.service';
import {
  addressLocationSourceFromSnapshot,
  distanceMetresBetween,
  riderArrivalPolicy,
} from './rider-arrival-evidence';
import { DeliveryWorkflowService } from './delivery-workflow.service';

type Actor = { id: string; role: Role };
type PhotoCompletionInput = {
  riderConfirmed: boolean;
  note?: string;
  latitude: number;
  longitude: number;
  accuracyMetres?: number;
};

@Injectable()
export class DeliveryPhotoProofService {
  constructor(
    private readonly workflow: DeliveryWorkflowService,
    private readonly uploads: UploadService,
  ) {}

  private coordinates(latitude: number, longitude: number) {
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new BadRequestException('A valid delivery latitude is required for photo proof');
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new BadRequestException('A valid delivery longitude is required for photo proof');
    }
  }

  private photoLocationDecision(job: any, input: PhotoCompletionInput) {
    const locationSource = addressLocationSourceFromSnapshot(job.order.addressSnapshot);
    const targetLatitude = Number(job.order.deliveryLat);
    const targetLongitude = Number(job.order.deliveryLng);
    const hasTarget = Number.isFinite(targetLatitude)
      && Number.isFinite(targetLongitude)
      && targetLatitude >= -90
      && targetLatitude <= 90
      && targetLongitude >= -180
      && targetLongitude <= 180;
    const policy = riderArrivalPolicy('CUSTOMER');

    if (locationSource === 'LIVE_GPS') {
      const accuracy = Number(input.accuracyMetres);
      if (!Number.isFinite(accuracy) || accuracy <= 0) {
        throw new BadRequestException('Fresh GPS accuracy is required for photo proof at a GPS-verified address');
      }
      if (accuracy > policy.maxAccuracyMetres) {
        throw new BadRequestException(
          `GPS accuracy must be within ${policy.maxAccuracyMetres} metres for photo proof`,
        );
      }
      if (!hasTarget) {
        throw new BadRequestException('The GPS-verified customer destination is unavailable');
      }
      const distanceMetres = Math.round(distanceMetresBetween(
        { latitude: input.latitude, longitude: input.longitude },
        { latitude: targetLatitude, longitude: targetLongitude },
      ));
      if (distanceMetres > policy.radiusMetres) {
        throw new BadRequestException(
          `Photo proof is ${distanceMetres} metres from the customer. Move within ${policy.radiusMetres} metres and retry.`,
        );
      }
      return {
        locationSource,
        verificationMode: 'HARD_GEOFENCE',
        decision: 'PASS',
        distanceMetres,
        radiusMetres: policy.radiusMetres,
      };
    }

    const distanceMetres = hasTarget
      ? Math.round(distanceMetresBetween(
          { latitude: input.latitude, longitude: input.longitude },
          { latitude: targetLatitude, longitude: targetLongitude },
        ))
      : null;
    return {
      locationSource,
      verificationMode: 'SOFT_AUDIT',
      decision: 'RECORDED',
      distanceMetres,
      radiusMetres: policy.radiusMetres,
    };
  }

  private async assertRiderJob(client: typeof prisma | Prisma.TransactionClient, deliveryJobId: string, actor: Actor) {
    if (actor.role !== Role.RIDER) {
      throw new ForbiddenException('Only the assigned Rider can use delivery photo proof');
    }
    const job = await client.deliveryJob.findUnique({
      where: { id: deliveryJobId },
      include: {
        order: { include: { payment: true } },
        deliveryProof: true,
      },
    });
    if (!job) throw new NotFoundException('Delivery job not found');

    const rider = await client.riderProfile.findUnique({ where: { userId: actor.id }, select: { id: true } });
    if (!rider || job.currentRiderId !== rider.id) {
      throw new ForbiddenException('You can only submit proof for your active delivery');
    }
    if (job.status === DeliveryJobStatus.DELIVERED) return { job, rider, delivered: true };
    if (job.status !== DeliveryJobStatus.RIDER_AT_CUSTOMER) {
      throw new BadRequestException('Arrive at the customer before submitting delivery photo proof');
    }
    if (job.deliveryProof) {
      throw new BadRequestException('Delivery proof already exists for this order');
    }

    if (job.order.payment?.method === PaymentMethod.COD) {
      const ledger = await client.codLedger.findUnique({ where: { deliveryJobId } });
      if (
        job.order.payment.status !== PaymentStatus.CAPTURED
        || !ledger
        || ledger.collectedAmountPaise !== ledger.expectedAmountPaise
      ) {
        throw new BadRequestException('Collect the full COD amount before using delivery photo proof');
      }
    }
    return { job, rider, delivered: false };
  }

  async completeWithPhoto(
    deliveryJobId: string,
    actor: Actor,
    file: Express.Multer.File,
    input: PhotoCompletionInput,
    idempotencyKey?: string,
  ) {
    if (input.riderConfirmed !== true) {
      throw new BadRequestException('Rider handoff confirmation is required');
    }
    if (!file) throw new BadRequestException('Take a delivery photo before submitting proof');
    this.coordinates(input.latitude, input.longitude);

    const preflight = await this.assertRiderJob(prisma, deliveryJobId, actor);
    if (preflight.delivered) return preflight.job;
    this.photoLocationDecision(preflight.job, input);

    const { storageKey } = await this.uploads.uploadEvidence(file, actor.id);
    try {
      const outcome = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`delivery-complete:${deliveryJobId}`}))`);
        const current = await this.assertRiderJob(tx, deliveryJobId, actor);
        if (current.delivered || current.job.status === DeliveryJobStatus.DELIVERED) {
          return { job: current.job, unusedUpload: true };
        }
        const job = current.job;
        if (!job.currentRiderId) throw new BadRequestException('Delivery has no assigned Rider');
        const locationDecision = this.photoLocationDecision(job, input);

        const now = new Date();
        const proof = await tx.deliveryProof.create({
          data: {
            deliveryJobId,
            orderId: job.orderId,
            riderId: job.currentRiderId,
            customerUserId: job.order.customerId,
            verificationMethod: 'RIDER_PHOTO_EVIDENCE',
            proofReference: storageKey,
            riderConfirmedAt: now,
            verifiedAt: now,
            note: input.note?.trim() || 'Rider photo proof used because customer OTP was unavailable.',
            latitude: input.latitude,
            longitude: input.longitude,
            accuracyMetres: input.accuracyMetres,
          },
        });

        const operationDetails = JSON.stringify({
          deliveryProofId: proof.id,
          riderId: job.currentRiderId,
          customerUserId: job.order.customerId,
          verificationMethod: 'RIDER_PHOTO_EVIDENCE',
          proofReference: storageKey,
          riderConfirmedAt: now.toISOString(),
          verifiedAt: now.toISOString(),
          note: input.note?.trim() || null,
          latitude: input.latitude,
          longitude: input.longitude,
          accuracyMetres: input.accuracyMetres ?? null,
          locationDecision,
          otpFallback: true,
        });
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "DeliveryOperation" (
            "id", "deliveryJobId", "orderId", "type", "status",
            "actorUserId", "actorRole", "idempotencyKey", "details",
            "createdAt", "updatedAt"
          ) VALUES (
            ${`dop_${randomUUID()}`}, ${deliveryJobId}, ${job.orderId},
            'DELIVERY_PROOF_RECORDED'::"DeliveryOperationType",
            'COMPLETED'::"DeliveryOperationStatus",
            ${actor.id}, ${actor.role}::"Role",
            ${`delivery-proof:${deliveryJobId}`}, ${operationDetails}::jsonb,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
          ON CONFLICT ("idempotencyKey") DO NOTHING
        `);

        await tx.$executeRaw(Prisma.sql`
          UPDATE "DeliveryOperation"
          SET "status" = 'SUPERSEDED'::"DeliveryOperationStatus",
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE "deliveryJobId" = ${deliveryJobId}
            AND "type" = 'OTP_ISSUED'::"DeliveryOperationType"
            AND "status" = 'PENDING'::"DeliveryOperationStatus"
        `);

        const delivered = await this.workflow.transitionWithinTransaction(
          tx,
          deliveryJobId,
          DeliveryJobStatus.DELIVERED,
          actor,
          {
            expectedStatus: DeliveryJobStatus.RIDER_AT_CUSTOMER,
            metadata: {
              phase5DeliveryProofId: proof.id,
              proofType: 'RIDER_PHOTO_EVIDENCE',
              proofReference: storageKey,
              riderConfirmed: true,
              coordinatesRecorded: true,
              addressLocationSource: locationDecision.locationSource,
              photoLocationVerificationMode: locationDecision.verificationMode,
              photoLocationDecision: locationDecision.decision,
              photoDistanceMetres: locationDecision.distanceMetres,
              photoAllowedRadiusMetres: locationDecision.radiusMetres,
              completionIdempotencyKey: idempotencyKey || null,
              otpFallback: true,
            },
          },
        );

        await tx.deliveryFailureDecision.updateMany({
          where: { deliveryJobId, status: 'IN_PROGRESS' },
          data: { status: 'COMPLETED', appliedByUserId: actor.id, appliedAt: now },
        });
        return { job: delivered, unusedUpload: false };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

      if (outcome.unusedUpload) {
        await this.uploads.deleteEvidence(storageKey).catch(() => undefined);
      }
      return outcome.job;
    } catch (error) {
      await this.uploads.deleteEvidence(storageKey).catch(() => undefined);
      throw error;
    }
  }
}
