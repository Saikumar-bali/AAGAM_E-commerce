import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, prisma } from '@aagam/database';
import { RiderContactDto, RiderHistoryQueryDto } from './rider-portal.dto';
import { RiderPortalReadService } from './rider-portal-read.service';

const TERMINAL_STATUSES = new Set([
  'DELIVERED',
  'DELIVERY_FAILED',
  'RETURNED_TO_STORE',
  'CANCELLED',
]);

const secureJobInclude = {
  order: {
    include: {
      customer: { select: { id: true, name: true } },
      store: {
        select: {
          id: true,
          name: true,
          address: true,
          latitude: true,
          longitude: true,
        },
      },
      payment: {
        select: {
          method: true,
          status: true,
          amountPaise: true,
          currency: true,
        },
      },
      items: {
        include: {
          product: {
            select: { id: true, name: true, image: true, details: true },
          },
        },
      },
    },
  },
  events: { orderBy: { createdAt: 'asc' as const } },
  assignments: { orderBy: { createdAt: 'desc' as const }, take: 25 },
  pickupProof: true,
  deliveryProof: true,
  codLedger: {
    include: { entries: { orderBy: { createdAt: 'asc' as const } } },
  },
  failureDecisions: { orderBy: { createdAt: 'desc' as const }, take: 25 },
} as const;

type SecureJob = Prisma.DeliveryJobGetPayload<{
  include: typeof secureJobInclude;
}>;

type Ownership = {
  riderId: string;
  job: SecureJob;
  currentOwner: boolean;
};

@Injectable()
export class RiderPortalSecureService {
  constructor(private readonly read: RiderPortalReadService) {}

  private async riderId(userId: string) {
    const rider = await prisma.riderProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!rider) throw new NotFoundException('Rider profile not found');
    return rider.id;
  }

  private range(query: RiderHistoryQueryDto) {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && from > to) {
      throw new ConflictException('from must be before to');
    }
    return from || to
      ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) }
      : undefined;
  }

  private historicallyOwned(job: SecureJob, riderId: string) {
    const status = String(job.status);
    const deliveryOwner = job.deliveryProof?.riderId === riderId;
    const pickupOwner = job.pickupProof?.riderId === riderId;
    const cancelledAcceptedOwner =
      status === 'CANCELLED' &&
      job.assignments.some(
        (assignment) =>
          assignment.riderProfileId === riderId &&
          ['ACCEPTED', 'CANCELLED'].includes(String(assignment.status)),
      );

    // Delivery proof is the final authority. A pickup proof grants historical
    // access only when another Rider did not later complete the delivery.
    return (
      deliveryOwner ||
      (status !== 'DELIVERED' && pickupOwner) ||
      cancelledAcceptedOwner
    );
  }

  private async ownedJob(
    userId: string,
    deliveryJobId: string,
  ): Promise<Ownership> {
    const riderId = await this.riderId(userId);
    const job = await prisma.deliveryJob.findFirst({
      where: { id: deliveryJobId },
      include: secureJobInclude,
    });
    if (!job) throw new NotFoundException('Rider delivery job not found');
    const currentOwner = job.currentRiderId === riderId;
    if (!currentOwner && !this.historicallyOwned(job, riderId)) {
      throw new NotFoundException('Rider delivery job not found');
    }
    return { riderId, job, currentOwner };
  }

  private async operations(deliveryJobId: string) {
    return prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "id", "type"::text, "status"::text, "actorUserId",
             "actorRole"::text,
             CASE WHEN "type" = 'OTP_ISSUED'::"DeliveryOperationType"
               THEN "details" - 'nonce' - 'salt' - 'codeHash'
               ELSE "details" END AS "details",
             "createdAt", "updatedAt"
      FROM "DeliveryOperation"
      WHERE "deliveryJobId" = ${deliveryJobId}
      ORDER BY "createdAt" ASC, "id" ASC
    `);
  }

  private signedAmount(row: { type: string; amountPaise: number }) {
    return row.type === 'PENALTY'
      ? -Math.abs(row.amountPaise)
      : row.amountPaise;
  }

  async history(userId: string, query: RiderHistoryQueryDto) {
    const riderId = await this.riderId(userId);
    const updatedAt = this.range(query);
    const statuses =
      query.status && query.status !== 'ALL'
        ? [query.status]
        : ['DELIVERED', 'DELIVERY_FAILED', 'RETURNED_TO_STORE', 'CANCELLED'];

    return prisma.deliveryJob.findMany({
      where: {
        status: { in: statuses as any },
        OR: [
          { currentRiderId: riderId },
          { deliveryProof: { is: { riderId } } },
          {
            AND: [
              { status: { not: 'DELIVERED' as any } },
              { pickupProof: { is: { riderId } } },
            ],
          },
          {
            AND: [
              { status: 'CANCELLED' as any },
              {
                assignments: {
                  some: {
                    riderProfileId: riderId,
                    status: { in: ['ACCEPTED', 'CANCELLED'] as any },
                  },
                },
              },
            ],
          },
        ],
        ...(updatedAt ? { updatedAt } : {}),
      },
      include: secureJobInclude,
      orderBy: { updatedAt: 'desc' },
      take: 250,
    });
  }

  async historyDetail(userId: string, deliveryJobId: string) {
    const ownership = await this.ownedJob(userId, deliveryJobId);
    if (ownership.currentOwner) {
      return this.read.historyDetail(userId, deliveryJobId);
    }
    const [earnings, operations] = await Promise.all([
      prisma.riderEarning.findMany({
        where: {
          riderProfileId: ownership.riderId,
          deliveryJobId,
        },
        orderBy: { earnedAt: 'asc' },
      }),
      this.operations(deliveryJobId),
    ]);
    return {
      job: ownership.job,
      earnings,
      operations,
      receiptAvailable: TERMINAL_STATUSES.has(String(ownership.job.status)),
    };
  }

  async receipt(userId: string, deliveryJobId: string) {
    const ownership = await this.ownedJob(userId, deliveryJobId);
    if (ownership.currentOwner) {
      return this.read.receipt(userId, deliveryJobId);
    }
    const job = ownership.job;
    if (!TERMINAL_STATUSES.has(String(job.status))) {
      throw new ConflictException(
        'A final receipt is available only after the delivery reaches a terminal state',
      );
    }
    const [earnings, operations] = await Promise.all([
      prisma.riderEarning.findMany({
        where: {
          riderProfileId: ownership.riderId,
          deliveryJobId,
        },
        orderBy: { earnedAt: 'asc' },
      }),
      this.operations(deliveryJobId),
    ]);
    const itemCount = job.order.items.reduce(
      (sum, line) => sum + Number(line.quantity || 0),
      0,
    );
    const earningsTotalPaise = earnings.reduce(
      (sum, row) => sum + this.signedAmount(row),
      0,
    );
    const issuedAt =
      job.deliveryProof?.verifiedAt ||
      job.pickupProof?.verifiedAt ||
      job.updatedAt;
    const timeline = [
      ...job.events.map((event) => ({
        id: event.id,
        source: 'DELIVERY_EVENT',
        type: event.eventType,
        status: event.toStatus || event.fromStatus || null,
        details: event.metadata || null,
        createdAt: event.createdAt,
      })),
      ...operations.map((operation) => ({
        id: operation.id,
        source: 'DELIVERY_OPERATION',
        type: operation.type,
        status: operation.status,
        details: operation.details || null,
        createdAt: operation.createdAt,
      })),
    ].sort(
      (left, right) =>
        new Date(left.createdAt).getTime() -
        new Date(right.createdAt).getTime(),
    );

    return {
      schemaVersion: 1,
      receiptId: `RIDER-${job.id}`,
      issuedAt,
      deliveryJobId: job.id,
      orderId: job.orderId,
      status: job.status,
      order: {
        currency: job.order.currency,
        amountPaise: job.order.grandTotalPaise,
        itemCount,
        parcelCount: job.pickupProof?.parcelCount || null,
        store: job.order.store,
        customer: { name: job.order.customer?.name || 'Customer' },
        addressSnapshot: job.order.addressSnapshot,
        items: job.order.items.map((line) => ({
          id: line.id,
          productId: line.productId,
          name: line.product.name,
          image: line.product.image,
          quantity: line.quantity,
          unitPricePaise: line.unitPricePaise,
          lineTotalPaise: line.lineTotalPaise,
        })),
      },
      proof: {
        pickup: job.pickupProof,
        delivery: job.deliveryProof,
      },
      cod: job.codLedger
        ? {
            currency: job.codLedger.currency,
            expectedAmountPaise: job.codLedger.expectedAmountPaise,
            collectedAmountPaise: job.codLedger.collectedAmountPaise,
            depositedAmountPaise: job.codLedger.depositedAmountPaise,
            riderHoldingBalancePaise:
              job.codLedger.riderHoldingBalancePaise,
            settlementReference: job.codLedger.settlementReference,
            variancePaise: job.codLedger.variancePaise,
            varianceReason: job.codLedger.varianceReason,
            status: job.codLedger.status,
            entries: job.codLedger.entries,
          }
        : null,
      earnings: {
        totalPaise: earningsTotalPaise,
        records: earnings,
      },
      timeline,
    };
  }

  private safeDestination(snapshot: unknown) {
    const address =
      snapshot && typeof snapshot === 'object'
        ? (snapshot as Record<string, unknown>)
        : {};
    const safeText = (...values: unknown[]) =>
      values.find(
        (value): value is string =>
          typeof value === 'string' && value.trim().length > 0,
      )?.trim() || null;
    return {
      area: safeText(
        address.area,
        address.locality,
        address.neighborhood,
        address.city,
      ),
      city: safeText(address.city, address.district),
      state: safeText(address.state),
      approximate: true,
    };
  }

  async offerDetail(userId: string, assignmentId: string) {
    const result: any = await this.read.offerDetail(userId, assignmentId);
    const assignment = result.assignment || {};
    const offer = result.offer || {};
    const rawSnapshot = offer.delivery?.addressSnapshot;
    return {
      assignment: {
        id: assignment.id,
        status: assignment.status,
        offeredAt: assignment.offeredAt,
        expiresAt: assignment.expiresAt,
        respondedAt: assignment.respondedAt,
        rejectionReason: assignment.rejectionReason,
      },
      offer: {
        ...offer,
        delivery: this.safeDestination(rawSnapshot),
        specialHandling: null,
        instructionsAvailableAfterAcceptance: Boolean(offer.specialHandling),
      },
    };
  }

  async contact(
    userId: string,
    deliveryJobId: string,
    input: RiderContactDto,
  ) {
    // RiderPortalReadService.contact performs the current-Rider ownership check,
    // active delivery status check, target contact resolution, and safety escalation.
    return this.read.contact(userId, deliveryJobId, input);
  }
}
