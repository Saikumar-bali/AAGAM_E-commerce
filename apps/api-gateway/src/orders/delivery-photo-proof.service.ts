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
import { UploadService } from '../upload/upload.service';
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

    const { storageKey } = await this.uploads.uploadEvidence(file, actor.id);
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`delivery-photo-proof:${deliveryJobId}`}))`);
        const { job } = await this.assertRiderJob(tx, deliveryJobId, actor);
        if (job.status === DeliveryJobStatus.DELIVERED) return job;
        if (!job.currentRiderId) throw new BadRequestException('Delivery has no assigned Rider');

        const now = new Date();
        const proof = await tx.deliveryProof.create({
          data: {
            deliveryJobId,
            orderId: job.orderId,
            riderId: job.currentRiderId,
            customerUserId: job.order.customerId,
            // SECURITY_RECEPTION is the existing non-OTP verification bucket. The
            // authoritative photo mode is recorded in proofReference + timeline metadata.
            verificationMethod: 'SECURITY_RECEPTION',
            proofReference: storageKey,
            riderConfirmedAt: now,
            verifiedAt: now,
            note: input.note?.trim() || 'Rider photo proof used because customer OTP was unavailable.',
            latitude: input.latitude,
            longitude: input.longitude,
            accuracyMetres: input.accuracyMetres,
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
              proofType: 'RIDER_PHOTO_EVIDENCE',
              proofReference: storageKey,
              riderConfirmed: true,
              coordinatesRecorded: true,
              completionIdempotencyKey: idempotencyKey || null,
              otpFallback: true,
            },
          },
        );

        await tx.deliveryFailureDecision.updateMany({
          where: { deliveryJobId, status: 'IN_PROGRESS' },
          data: { status: 'COMPLETED', appliedByUserId: actor.id, appliedAt: now },
        });
        return delivered;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      await this.uploads.deleteEvidence(storageKey).catch(() => undefined);
      throw error;
    }
  }
}
