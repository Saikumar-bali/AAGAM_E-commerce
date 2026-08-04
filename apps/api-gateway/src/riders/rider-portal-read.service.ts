import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma, prisma } from "@aagam/database";
import { UploadService } from "../upload/upload.service";
import {
  RiderAvailabilityEntryDto,
  RiderContactDto,
} from "./rider-portal.dto";

const TERMINAL_STATUSES = new Set([
  "DELIVERED",
  "DELIVERY_FAILED",
  "RETURNED_TO_STORE",
  "CANCELLED",
]);

const ACTIVE_CONTACT_STATUSES = [
  "RIDER_ASSIGNED",
  "RIDER_EN_ROUTE_TO_STORE",
  "RIDER_AT_STORE",
  "PICKUP_VERIFIED",
  "OUT_FOR_DELIVERY",
  "RIDER_AT_CUSTOMER",
  "DELIVERY_FAILED",
  "RETURNING_TO_STORE",
];

const portalJobInclude = {
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
  events: { orderBy: { createdAt: "asc" as const } },
  assignments: { orderBy: { createdAt: "desc" as const }, take: 25 },
  pickupProof: true,
  deliveryProof: true,
  codLedger: {
    include: { entries: { orderBy: { createdAt: "asc" as const } } },
  },
  failureDecisions: { orderBy: { createdAt: "desc" as const }, take: 25 },
} as const;

type PortalJob = Prisma.DeliveryJobGetPayload<{
  include: typeof portalJobInclude;
}>;

@Injectable()
export class RiderPortalReadService {
  constructor(private readonly upload: UploadService) {}

  private async rider(userId: string) {
    const rider = await prisma.riderProfile.findUnique({
      where: { userId },
      select: { id: true, userId: true },
    });
    if (!rider) throw new NotFoundException("Rider profile not found");
    return rider;
  }

  private async ownedJob(userId: string, deliveryJobId: string) {
    const rider = await this.rider(userId);
    const job = await prisma.deliveryJob.findFirst({
      where: { id: deliveryJobId, currentRiderId: rider.id },
      include: portalJobInclude,
    });
    if (!job) throw new NotFoundException("Rider delivery job not found");
    return { rider, job };
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
    return row.type === "PENALTY"
      ? -Math.abs(row.amountPaise)
      : row.amountPaise;
  }

  async historyDetail(userId: string, deliveryJobId: string) {
    const { rider, job } = await this.ownedJob(userId, deliveryJobId);
    const [earnings, operations] = await Promise.all([
      prisma.riderEarning.findMany({
        where: { riderProfileId: rider.id, deliveryJobId },
        orderBy: { earnedAt: "asc" },
      }),
      this.operations(deliveryJobId),
    ]);
    return {
      job,
      earnings,
      operations,
      receiptAvailable: TERMINAL_STATUSES.has(String(job.status)),
    };
  }

  async receipt(userId: string, deliveryJobId: string) {
    const { rider, job } = await this.ownedJob(userId, deliveryJobId);
    if (!TERMINAL_STATUSES.has(String(job.status))) {
      throw new ConflictException(
        "A final receipt is available only after the delivery reaches a terminal state"
      );
    }

    const [earnings, operations] = await Promise.all([
      prisma.riderEarning.findMany({
        where: { riderProfileId: rider.id, deliveryJobId },
        orderBy: { earnedAt: "asc" },
      }),
      this.operations(deliveryJobId),
    ]);
    const itemCount = job.order.items.reduce(
      (sum, line) => sum + Number(line.quantity || 0),
      0
    );
    const earningsTotalPaise = earnings.reduce(
      (sum, row) => sum + this.signedAmount(row),
      0
    );
    const issuedAt =
      job.deliveryProof?.verifiedAt ||
      job.pickupProof?.verifiedAt ||
      job.updatedAt;
    const timeline = [
      ...job.events.map((event) => ({
        id: event.id,
        source: "DELIVERY_EVENT",
        type: event.eventType,
        status: event.toStatus || event.fromStatus || null,
        details: event.metadata || null,
        createdAt: event.createdAt,
      })),
      ...operations.map((operation) => ({
        id: operation.id,
        source: "DELIVERY_OPERATION",
        type: operation.type,
        status: operation.status,
        details: operation.details || null,
        createdAt: operation.createdAt,
      })),
    ].sort(
      (left, right) =>
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
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
        customer: { name: job.order.customer?.name || "Customer" },
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

  async offerDetail(userId: string, assignmentId: string) {
    const rider = await this.rider(userId);
    const assignment = await prisma.dispatchAssignment.findFirst({
      where: { id: assignmentId, riderProfileId: rider.id },
      include: { deliveryJob: { include: portalJobInclude } },
    });
    if (!assignment)
      throw new NotFoundException("Rider delivery offer not found");

    const job = assignment.deliveryJob;
    const [earnings, configuredShiftCount, coveringShift] = await Promise.all([
      prisma.riderEarning.findMany({
        where: { riderProfileId: rider.id, deliveryJobId: job.id },
        orderBy: { earnedAt: "asc" },
      }),
      prisma.riderShift.count({ where: { riderProfileId: rider.id } }),
      prisma.riderShift.findFirst({
        where: {
          riderProfileId: rider.id,
          status: { in: ["SCHEDULED", "ACTIVE"] },
          startsAt: { lte: assignment.expiresAt || new Date() },
          endsAt: { gte: assignment.offeredAt || assignment.createdAt },
        },
      }),
    ]);
    const distanceKm = this.distanceKm(
      job.order.store.latitude,
      job.order.store.longitude,
      job.order.deliveryLat,
      job.order.deliveryLng
    );
    const payoutBreakdown = earnings.map((record) => ({
      type: record.type,
      amountPaise: this.signedAmount(record),
      status: record.status,
      reference: record.reference,
    }));

    return {
      assignment,
      offer: {
        assignmentId: assignment.id,
        deliveryJobId: job.id,
        status: assignment.status,
        offeredAt: assignment.offeredAt,
        expiresAt: assignment.expiresAt,
        orderId: job.orderId,
        pickup: job.order.store,
        delivery: {
          customerName: job.order.customer?.name || "Customer",
          addressSnapshot: job.order.addressSnapshot,
          latitude: job.order.deliveryLat,
          longitude: job.order.deliveryLng,
        },
        payout: {
          currency: job.order.currency,
          totalPaise: payoutBreakdown.length
            ? payoutBreakdown.reduce(
                (sum, record) => sum + record.amountPaise,
                0
              )
            : null,
          breakdown: payoutBreakdown,
          authoritative: payoutBreakdown.length > 0,
        },
        cod: {
          required: job.order.payment?.method === "COD",
          amountPaise:
            job.order.payment?.method === "COD"
              ? job.order.payment.amountPaise
              : 0,
          responsibility: job.order.payment?.method === "COD"
            ? "Collect the exact amount and retain it until a recorded settlement"
            : "No cash collection",
        },
        parcelCount: job.pickupProof?.parcelCount || null,
        itemCount: job.order.items.reduce(
          (sum, item) => sum + Number(item.quantity || 0),
          0
        ),
        lineCount: job.order.items.length,
        distanceKm,
        etaMinutes:
          distanceKm == null ? null : Math.max(8, Math.round((distanceKm / 22) * 60)),
        etaIsEstimate: distanceKm != null,
        specialHandling:
          (job.order.addressSnapshot as any)?.instructions || null,
        shiftConflict:
          configuredShiftCount > 0 && coveringShift == null,
        rejectionReasons: [
          "DISTANCE_TOO_FAR",
          "SHIFT_CONFLICT",
          "VEHICLE_UNSUITABLE",
          "SAFETY_CONCERN",
          "CURRENT_JOB_DELAY",
          "OTHER",
        ],
      },
    };
  }

  async profile(userId: string) {
    const now = new Date();
    const warningAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const rider = await prisma.riderProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        status: true,
        vehicleType: true,
        vehicleNumber: true,
        emergencyContactName: true,
        emergencyContactPhone: true,
        bankAccountLast4: true,
        bankStatus: true,
        bankReviewedAt: true,
        approvalStatus: true,
        approvalReviewedAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            avatarUrl: true,
            isActive: true,
            deactivatedAt: true,
            deactivationReason: true,
            createdAt: true,
          },
        },
        documents: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!rider) throw new NotFoundException("Rider profile not found");

    const documents = rider.documents.map((document) => ({
      ...document,
      isExpired: Boolean(document.expiresAt && document.expiresAt < now),
      expiresSoon: Boolean(
        document.expiresAt &&
          document.expiresAt >= now &&
          document.expiresAt <= warningAt
      ),
    }));
    const latestByType = new Map<string, (typeof documents)[number]>();
    for (const document of documents) {
      if (!latestByType.has(document.type))
        latestByType.set(document.type, document);
    }
    const requiredTypes = [
      "DRIVING_LICENSE",
      "IDENTITY",
      "VEHICLE_REGISTRATION",
      "VEHICLE_INSURANCE",
    ];
    const changesRequested = documents.filter(
      (document) => document.status === "REJECTED"
    );
    const documentEligibility = requiredTypes.map((type) => {
      const document = latestByType.get(type);
      return {
        type,
        eligible: Boolean(
          document && document.status === "APPROVED" && !document.isExpired
        ),
        status: document?.status || "MISSING",
        expiresAt: document?.expiresAt || null,
      };
    });

    return {
      ...rider,
      documents,
      bank: rider.bankAccountLast4
        ? {
            accountMasked: `••••${rider.bankAccountLast4}`,
            status: rider.bankStatus,
            reviewedAt: rider.bankReviewedAt,
          }
        : null,
      lifecycle: {
        approvalStatus: rider.approvalStatus,
        approvalReviewedAt: rider.approvalReviewedAt,
        restricted: !rider.user.isActive,
        restrictionReason: rider.user.deactivationReason,
        restrictedAt: rider.user.deactivatedAt,
        changesRequested,
        documentEligibility,
        eligibleForOperations:
          rider.user.isActive &&
          rider.approvalStatus === "APPROVED" &&
          documentEligibility.every((entry) => entry.eligible),
        verificationHistory: documents.map((document) => ({
          documentId: document.id,
          type: document.type,
          status: document.status,
          note: document.reviewNote,
          reviewedAt: document.reviewedAt,
          expiresAt: document.expiresAt,
          submittedAt: document.createdAt,
        })),
      },
    };
  }

  async documentPreview(userId: string, documentId: string) {
    const rider = await this.rider(userId);
    const document = await prisma.riderDocument.findFirst({
      where: { id: documentId, riderProfileId: rider.id },
    });
    if (!document) throw new NotFoundException("Rider document not found");
    const history = await prisma.riderDocument.findMany({
      where: { riderProfileId: rider.id, type: document.type },
      orderBy: { createdAt: "desc" },
      take: 25,
    });
    const signed = await this.upload.signedEvidenceUrl(document.storageKey, {
      disposition: "inline",
      filename: `rider-${document.type.toLowerCase()}-${document.id}.${this.extension(
        document.storageKey
      )}`,
    });
    return {
      document: {
        ...document,
        mimeType: this.mimeType(document.storageKey),
      },
      preview: signed,
      replacementHistory: history,
    };
  }

  assertSchedule(entries: RiderAvailabilityEntryDto[]) {
    const byDay = new Map<number, RiderAvailabilityEntryDto[]>();
    for (const entry of entries) {
      if (entry.startMinute >= entry.endMinute) {
        throw new BadRequestException(
          "Availability start time must be before end time"
        );
      }
      if (!entry.isAvailable) continue;
      const rows = byDay.get(entry.dayOfWeek) || [];
      rows.push(entry);
      byDay.set(entry.dayOfWeek, rows);
    }
    for (const [day, rows] of byDay) {
      rows.sort((left, right) => left.startMinute - right.startMinute);
      for (let index = 1; index < rows.length; index += 1) {
        if (rows[index].startMinute < rows[index - 1].endMinute) {
          throw new ConflictException(
            `Availability windows overlap on day ${day}`
          );
        }
      }
    }
  }

  availabilityMetadata() {
    return {
      timezone: process.env.RIDER_TIMEZONE || "Asia/Kolkata",
      timezoneSource: process.env.RIDER_TIMEZONE ? "CONFIGURED" : "DEFAULT",
      supportsMultipleWindows: true,
      maxWindows: 28,
    };
  }

  async contact(
    userId: string,
    deliveryJobId: string,
    input: RiderContactDto
  ) {
    const rider = await this.rider(userId);
    const job = await prisma.deliveryJob.findFirst({
      where: {
        id: deliveryJobId,
        currentRiderId: rider.id,
        status: { in: ACTIVE_CONTACT_STATUSES as any },
      },
      include: {
        order: {
          include: {
            customer: { select: { phone: true } },
            store: {
              include: { owner: { select: { phone: true } } },
            },
          },
        },
      },
    });
    if (!job)
      throw new NotFoundException("Active Rider delivery job not found");

    if (input.channel === "SAFETY_ESCALATION") {
      const ticket = await prisma.riderSupportTicket.create({
        data: {
          riderProfileId: rider.id,
          deliveryJobId,
          category: "SAFETY",
          subject: `Safety escalation for order ${job.orderId}`,
          description:
            "The Rider requested an immediate safety escalation from the active-delivery contact control.",
          messages: {
            create: {
              senderUserId: userId,
              senderRole: "RIDER",
              body: "Immediate safety assistance requested.",
            },
          },
        },
      });
      return {
        channel: input.channel,
        targetRole: input.targetRole,
        status: "ESCALATED",
        supportTicketId: ticket.id,
      };
    }

    const targetPhone =
      input.targetRole === "STORE"
        ? job.order.store.owner.phone
        : job.order.customer.phone ||
          String((job.order.addressSnapshot as any)?.phoneE164 || "");
    if (!targetPhone)
      throw new NotFoundException("Contact is unavailable for this delivery");

    const relayNumber = String(
      process.env.RIDER_CONTACT_RELAY_NUMBER || ""
    ).trim();
    if (!relayNumber) {
      throw new ServiceUnavailableException(
        "Privacy contact relay is not configured"
      );
    }
    const reference = `AAGAM-${job.id.slice(-8).toUpperCase()}`;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const uri =
      input.channel === "CALL"
        ? `tel:${relayNumber}`
        : `sms:${relayNumber}?body=${encodeURIComponent(
            `${reference} ${input.targetRole}`
          )}`;
    return {
      channel: input.channel,
      targetRole: input.targetRole,
      status: "READY",
      reference,
      expiresAt,
      uri,
    };
  }

  private distanceKm(
    latitude1?: number | null,
    longitude1?: number | null,
    latitude2?: number | null,
    longitude2?: number | null
  ) {
    if (
      latitude1 == null ||
      longitude1 == null ||
      latitude2 == null ||
      longitude2 == null
    )
      return null;
    const radians = (value: number) => (value * Math.PI) / 180;
    const earthKm = 6371;
    const deltaLatitude = radians(latitude2 - latitude1);
    const deltaLongitude = radians(longitude2 - longitude1);
    const a =
      Math.sin(deltaLatitude / 2) ** 2 +
      Math.cos(radians(latitude1)) *
        Math.cos(radians(latitude2)) *
        Math.sin(deltaLongitude / 2) ** 2;
    return Number(
      (earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1)
    );
  }

  private extension(storageKey: string) {
    return storageKey.split(".").pop()?.toLowerCase() || "bin";
  }

  private mimeType(storageKey: string) {
    const extension = this.extension(storageKey);
    return (
      {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
        pdf: "application/pdf",
      } as Record<string, string>
    )[extension] || "application/octet-stream";
  }
}
