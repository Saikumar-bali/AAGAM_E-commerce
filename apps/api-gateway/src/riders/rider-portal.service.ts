import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createCipheriv, createHash, randomBytes } from "crypto";
import { Prisma, prisma, Role } from "@aagam/database";
import {
  AdminRiderEarningDto,
  AdminRiderReviewDto,
  AdminRiderShiftDto,
  PickupProblemDto,
  RiderAvailabilityEntryDto,
  RiderDocumentDto,
  RiderHistoryQueryDto,
  RiderProfileDto,
  RiderSupportMessageDto,
  RiderSupportTicketDto,
  VerifyPickupDto,
} from "./rider-portal.dto";

const ACTIVE_STATUSES = [
  "RIDER_ASSIGNED",
  "RIDER_EN_ROUTE_TO_STORE",
  "RIDER_AT_STORE",
  "PICKUP_VERIFIED",
  "OUT_FOR_DELIVERY",
  "RIDER_AT_CUSTOMER",
  "DELIVERY_FAILED",
  "RETURNING_TO_STORE",
];
const TERMINAL_STATUSES = [
  "DELIVERED",
  "DELIVERY_FAILED",
  "RETURNED_TO_STORE",
  "CANCELLED",
];
const jobInclude = {
  order: {
    include: {
      customer: { select: { id: true, name: true, phone: true } },
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
        include: { product: { select: { id: true, name: true, image: true } } },
      },
    },
  },
  events: { orderBy: { createdAt: "asc" as const } },
  assignments: { orderBy: { createdAt: "desc" as const }, take: 10 },
  pickupProof: true,
  deliveryProof: true,
  codLedger: {
    include: { entries: { orderBy: { createdAt: "asc" as const } } },
  },
  failureDecisions: { orderBy: { createdAt: "desc" as const }, take: 10 },
};

@Injectable()
export class RiderPortalService {
  private async rider(userId: string) {
    const rider = await prisma.riderProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            avatarUrl: true,
          },
        },
      },
    });
    if (!rider) throw new NotFoundException("Rider profile not found");
    return rider;
  }

  private range(query: RiderHistoryQueryDto) {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && from > to)
      throw new BadRequestException("from must be before to");
    return from || to
      ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) }
      : undefined;
  }

  private activeJob(riderProfileId: string) {
    return prisma.deliveryJob.findFirst({
      where: {
        currentRiderId: riderProfileId,
        status: { in: ACTIVE_STATUSES as any },
      },
      include: jobInclude,
      orderBy: { updatedAt: "desc" },
    });
  }

  private encryptSensitive(value: string) {
    const secret = process.env.RIDER_BANK_ENCRYPTION_KEY;
    if (!secret || secret.length < 24)
      throw new ServiceUnavailableException(
        "Protected bank storage is not configured"
      );
    const key = createHash("sha256").update(secret).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    return `${iv.toString("base64")}.${cipher
      .getAuthTag()
      .toString("base64")}.${ciphertext.toString("base64")}`;
  }

  async home(userId: string) {
    const rider = await this.rider(userId);
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    await prisma.dispatchAssignment.updateMany({
      where: {
        riderProfileId: rider.id,
        status: "OFFERED",
        expiresAt: { lt: now },
      },
      data: { status: "EXPIRED", respondedAt: now },
    });
    const [
      pendingOffers,
      activeJob,
      completedToday,
      alerts,
      unreadCount,
      currentBreak,
    ] = await Promise.all([
      prisma.dispatchAssignment.count({
        where: {
          riderProfileId: rider.id,
          status: "OFFERED",
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      }),
      this.activeJob(rider.id),
      prisma.deliveryJob.count({
        where: {
          currentRiderId: rider.id,
          status: "DELIVERED",
          order: { deliveredAt: { gte: today } },
        },
      }),
      prisma.notificationRecipient.findMany({
        where: { userId, status: { in: ["QUEUED", "SENT"] as any } },
        include: { notification: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.notificationRecipient.count({ where: { userId, readAt: null } }),
      prisma.riderBreak.findFirst({
        where: { riderProfileId: rider.id, status: "ACTIVE" },
      }),
    ]);
    return {
      rider: this.safeProfile(rider),
      pendingOffers,
      activeJob,
      completedToday,
      currentBreak,
      unreadCount,
      alerts: alerts.map((entry: any) => ({
        id: entry.id,
        title: entry.notification.title,
        body: entry.notification.body,
        deepLink: entry.notification.deepLink,
        deliveryJobId: entry.notification.deliveryJobId,
        createdAt: entry.createdAt,
      })),
    };
  }

  async offers(userId: string) {
    const rider = await this.rider(userId);
    const now = new Date();
    await prisma.dispatchAssignment.updateMany({
      where: {
        riderProfileId: rider.id,
        status: "OFFERED",
        expiresAt: { lt: now },
      },
      data: { status: "EXPIRED", respondedAt: now },
    });
    return prisma.dispatchAssignment.findMany({
      where: {
        riderProfileId: rider.id,
        status: "OFFERED",
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: { deliveryJob: { include: jobInclude } },
      orderBy: { offeredAt: "asc" },
    });
  }

  async currentDelivery(userId: string) {
    const rider = await this.rider(userId);
    const job = await this.activeJob(rider.id);
    if (!job) return null;
    const operations = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "id", "type"::text, "status"::text, "actorUserId", "actorRole"::text,
             CASE WHEN "type" = 'OTP_ISSUED'::"DeliveryOperationType"
               THEN "details" - 'nonce' - 'salt' - 'codeHash'
               ELSE "details" END AS "details",
             "createdAt"
      FROM "DeliveryOperation" WHERE "deliveryJobId" = ${job.id} ORDER BY "createdAt" ASC
    `);
    return { ...job, operations };
  }

  async history(userId: string, query: RiderHistoryQueryDto) {
    const rider = await this.rider(userId);
    const updatedAt = this.range(query);
    const statuses =
      query.status && query.status !== "ALL"
        ? [query.status]
        : TERMINAL_STATUSES;
    return prisma.deliveryJob.findMany({
      where: {
        currentRiderId: rider.id,
        status: { in: statuses as any },
        ...(updatedAt ? { updatedAt } : {}),
      },
      include: jobInclude,
      orderBy: { updatedAt: "desc" },
      take: 250,
    });
  }

  async pickup(userId: string) {
    const rider = await this.rider(userId);
    const job = await prisma.deliveryJob.findFirst({
      where: {
        currentRiderId: rider.id,
        status: { in: ["RIDER_AT_STORE", "PICKUP_VERIFIED"] as any },
      },
      include: jobInclude,
      orderBy: { updatedAt: "desc" },
    });
    if (!job) return null;
    const existing = await prisma.riderPickupTask.findUnique({
      where: { deliveryJobId: job.id },
    });
    const checklist = job.order.items.map((item: any) => ({
      orderItemId: item.id,
      productId: item.productId,
      name: item.product.name,
      expectedQuantity: item.quantity,
      checkedQuantity: 0,
    }));
    const task =
      existing ||
      (await prisma.riderPickupTask.create({
        data: { riderProfileId: rider.id, deliveryJobId: job.id, checklist },
      }));
    return { job, task };
  }

  async verifyPickup(
    userId: string,
    deliveryJobId: string,
    input: VerifyPickupDto
  ) {
    const rider = await this.rider(userId);
    const job = await prisma.deliveryJob.findFirst({
      where: { id: deliveryJobId, currentRiderId: rider.id },
      include: { order: { include: { items: true } } },
    });
    if (!job) throw new NotFoundException("Assigned delivery job not found");
    if (job.status !== "RIDER_AT_STORE")
      throw new ConflictException(
        "Pickup checklist is available only at the store"
      );
    const submitted = new Map(
      input.lines.map((line) => [line.orderItemId, line.checkedQuantity])
    );
    if (
      job.order.items.some(
        (item: any) => submitted.get(item.id) !== item.quantity
      )
    )
      throw new BadRequestException(
        "Every item quantity must match the order before pickup verification"
      );
    const checklist = job.order.items.map((item: any) => ({
      orderItemId: item.id,
      expectedQuantity: item.quantity,
      checkedQuantity: submitted.get(item.id),
      verified: true,
    }));
    return prisma.riderPickupTask.upsert({
      where: { deliveryJobId },
      create: {
        riderProfileId: rider.id,
        deliveryJobId,
        checklist,
        parcelCode: input.parcelCode,
        status: "VERIFIED",
        verifiedAt: new Date(),
      },
      update: {
        checklist,
        parcelCode: input.parcelCode,
        status: "VERIFIED",
        verifiedAt: new Date(),
        problemType: null,
        problemNote: null,
      },
    });
  }

  async reportPickupProblem(
    userId: string,
    deliveryJobId: string,
    input: PickupProblemDto
  ) {
    const rider = await this.rider(userId);
    const job = await prisma.deliveryJob.findFirst({
      where: { id: deliveryJobId, currentRiderId: rider.id },
    });
    if (!job) throw new NotFoundException("Assigned delivery job not found");
    if (job.status !== "RIDER_AT_STORE")
      throw new ConflictException(
        "Pickup problems can be reported only at the store"
      );
    return prisma.riderPickupTask.upsert({
      where: { deliveryJobId },
      create: {
        riderProfileId: rider.id,
        deliveryJobId,
        checklist: [],
        status: "PROBLEM_REPORTED",
        problemType: input.problemType,
        problemNote: input.note,
      },
      update: {
        status: "PROBLEM_REPORTED",
        problemType: input.problemType,
        problemNote: input.note,
      },
    });
  }

  async earnings(userId: string, query: RiderHistoryQueryDto) {
    const rider = await this.rider(userId);
    const earnedAt = this.range(query);
    const records = await prisma.riderEarning.findMany({
      where: { riderProfileId: rider.id, ...(earnedAt ? { earnedAt } : {}) },
      orderBy: { earnedAt: "desc" },
      take: 500,
    });
    const signed = (row: any) =>
      row.type === "PENALTY" ? -Math.abs(row.amountPaise) : row.amountPaise;
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(dayStart);
    weekStart.setDate(dayStart.getDate() - ((dayStart.getDay() + 6) % 7));
    return {
      records,
      summary: {
        dailyPaise: records
          .filter((r: any) => r.earnedAt >= dayStart)
          .reduce((sum: number, r: any) => sum + signed(r), 0),
        weeklyPaise: records
          .filter((r: any) => r.earnedAt >= weekStart)
          .reduce((sum: number, r: any) => sum + signed(r), 0),
        pendingPaise: records
          .filter((r: any) => r.status === "PENDING")
          .reduce((sum: number, r: any) => sum + signed(r), 0),
        paidPaise: records
          .filter((r: any) => r.status === "PAID")
          .reduce((sum: number, r: any) => sum + signed(r), 0),
      },
    };
  }

  async cod(userId: string) {
    const rider = await this.rider(userId);
    const ledgers = await prisma.codLedger.findMany({
      where: { riderId: rider.id },
      include: {
        entries: { orderBy: { createdAt: "desc" } },
        order: { select: { id: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 250,
    });
    return {
      cashHeldPaise: ledgers.reduce(
        (sum, row) => sum + row.riderHoldingBalancePaise,
        0
      ),
      collectedPaise: ledgers.reduce(
        (sum, row) => sum + row.collectedAmountPaise,
        0
      ),
      depositedPaise: ledgers.reduce(
        (sum, row) => sum + row.depositedAmountPaise,
        0
      ),
      variancePaise: ledgers.reduce((sum, row) => sum + row.variancePaise, 0),
      pendingHandovers: ledgers.filter(
        (row) =>
          row.riderHoldingBalancePaise > 0 || row.status === "VARIANCE_REVIEW"
      ),
      ledgers,
      audit: ledgers.flatMap((row) =>
        row.entries.map((entry) => ({
          ...entry,
          deliveryJobId: row.deliveryJobId,
          orderId: row.orderId,
          settlementStatus: row.status,
        }))
      ),
    };
  }

  async performance(userId: string, query: RiderHistoryQueryDto) {
    const rider = await this.rider(userId);
    const createdAt = this.range(query);
    const [assignmentEvents, jobs] = await Promise.all([
      prisma.deliveryEvent.findMany({
        where: {
          assignment: { riderProfileId: rider.id },
          eventType: {
            in: [
              "ASSIGNMENT_OFFERED",
              "ASSIGNMENT_ACCEPTED",
              "ASSIGNMENT_REJECTED",
              "ASSIGNMENT_EXPIRED",
            ] as any,
          },
          ...(createdAt ? { createdAt } : {}),
        },
        select: { assignmentId: true, eventType: true },
      }),
      prisma.deliveryJob.findMany({
        where: {
          currentRiderId: rider.id,
          ...(createdAt ? { updatedAt: createdAt } : {}),
        },
        include: {
          order: { select: { riderAssignedAt: true, deliveredAt: true } },
        },
      }),
    ]);
    const uniqueCount = (eventType: string) =>
      new Set(
        assignmentEvents
          .filter((event: any) => event.eventType === eventType)
          .map((event: any) => event.assignmentId)
      ).size;
    const received = uniqueCount("ASSIGNMENT_OFFERED");
    const accepted = uniqueCount("ASSIGNMENT_ACCEPTED");
    const delivered = jobs.filter((j: any) => j.status === "DELIVERED");
    const durations = delivered
      .map((j: any) =>
        j.order.riderAssignedAt && j.order.deliveredAt
          ? j.order.deliveredAt.getTime() - j.order.riderAssignedAt.getTime()
          : null
      )
      .filter((v: number | null): v is number => v !== null && v >= 0);
    const returned = jobs.filter(
      (j: any) => j.status === "RETURNED_TO_STORE"
    ).length;
    return {
      offersReceived: received,
      accepted,
      rejected: uniqueCount("ASSIGNMENT_REJECTED"),
      expired: uniqueCount("ASSIGNMENT_EXPIRED"),
      completed: delivered.length,
      failed: jobs.filter((j: any) => j.status === "DELIVERY_FAILED").length,
      acceptanceRate: received
        ? Number(((accepted / received) * 100).toFixed(2))
        : 0,
      averageDeliveryMinutes: durations.length
        ? Number(
            (
              durations.reduce((a, b) => a + b, 0) /
              durations.length /
              60000
            ).toFixed(1)
          )
        : null,
      returnRate: jobs.length
        ? Number(((returned / jobs.length) * 100).toFixed(2))
        : 0,
    };
  }

  async availability(userId: string) {
    const rider = await this.rider(userId);
    const now = new Date();
    const [schedule, currentShift, upcomingShifts, currentBreak] =
      await Promise.all([
        prisma.riderAvailabilitySchedule.findMany({
          where: { riderProfileId: rider.id },
          orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
        }),
        prisma.riderShift.findFirst({
          where: {
            riderProfileId: rider.id,
            startsAt: { lte: now },
            endsAt: { gte: now },
            status: { in: ["SCHEDULED", "ACTIVE"] as any },
          },
          orderBy: { startsAt: "asc" },
        }),
        prisma.riderShift.findMany({
          where: {
            riderProfileId: rider.id,
            startsAt: { gt: now },
            status: "SCHEDULED",
          },
          orderBy: { startsAt: "asc" },
          take: 10,
        }),
        prisma.riderBreak.findFirst({
          where: { riderProfileId: rider.id, status: "ACTIVE" },
        }),
      ]);
    return {
      status: rider.status,
      schedule,
      currentShift,
      upcomingShifts,
      currentBreak,
    };
  }

  async setStatus(userId: string, status: "ONLINE" | "OFFLINE") {
    const rider = await this.rider(userId);
    if ((await this.activeJob(rider.id)) && status === "OFFLINE")
      throw new ConflictException(
        "Complete or return the active delivery before going offline"
      );
    const activeBreak = await prisma.riderBreak.findFirst({
      where: { riderProfileId: rider.id, status: "ACTIVE" },
    });
    if (activeBreak && status === "ONLINE")
      throw new ConflictException("End the current break before going online");
    return prisma.riderProfile.update({
      where: { id: rider.id },
      data: { status },
    });
  }

  async setSchedule(userId: string, entries: RiderAvailabilityEntryDto[]) {
    const rider = await this.rider(userId);
    if (entries.some((entry) => entry.startMinute >= entry.endMinute))
      throw new BadRequestException(
        "Availability start time must be before end time"
      );
    return prisma.$transaction(async (tx) => {
      await tx.riderAvailabilitySchedule.deleteMany({
        where: { riderProfileId: rider.id },
      });
      if (entries.length)
        await tx.riderAvailabilitySchedule.createMany({
          data: entries.map((entry) => ({
            ...entry,
            riderProfileId: rider.id,
          })),
        });
      return tx.riderAvailabilitySchedule.findMany({
        where: { riderProfileId: rider.id },
        orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
      });
    });
  }

  async startBreak(userId: string, reason?: string) {
    const rider = await this.rider(userId);
    if (await this.activeJob(rider.id))
      throw new ConflictException(
        "Breaks cannot start during an active delivery"
      );
    if (
      await prisma.riderBreak.findFirst({
        where: { riderProfileId: rider.id, status: "ACTIVE" },
      })
    )
      throw new ConflictException("A break is already active");
    return prisma.$transaction(async (tx) => {
      const row = await tx.riderBreak.create({
        data: { riderProfileId: rider.id, reason: reason?.trim() || null },
      });
      await tx.riderProfile.update({
        where: { id: rider.id },
        data: { status: "OFFLINE" },
      });
      return row;
    });
  }

  async endBreak(userId: string) {
    const rider = await this.rider(userId);
    const active = await prisma.riderBreak.findFirst({
      where: { riderProfileId: rider.id, status: "ACTIVE" },
      orderBy: { startedAt: "desc" },
    });
    if (!active) throw new NotFoundException("No active break");
    return prisma.$transaction(async (tx) => {
      const row = await tx.riderBreak.update({
        where: { id: active.id },
        data: { status: "ENDED", endedAt: new Date() },
      });
      await tx.riderProfile.update({
        where: { id: rider.id },
        data: { status: "ONLINE" },
      });
      return row;
    });
  }

  private safeProfile(rider: any) {
    const {
      bankAccountCiphertext: _account,
      bankIfscCiphertext: _ifsc,
      ...safe
    } = rider;
    return {
      ...safe,
      bank: rider.bankAccountLast4
        ? {
            accountMasked: `••••${rider.bankAccountLast4}`,
            status: rider.bankStatus,
          }
        : null,
    };
  }

  async profile(userId: string) {
    const rider = await prisma.riderProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            avatarUrl: true,
            createdAt: true,
          },
        },
        documents: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!rider) throw new NotFoundException("Rider profile not found");
    return this.safeProfile(rider);
  }

  async updateProfile(userId: string, input: RiderProfileDto) {
    const rider = await this.rider(userId);
    const bankRequested =
      input.bankAccountNumber !== undefined || input.bankIfsc !== undefined;
    if (bankRequested && (!input.bankAccountNumber || !input.bankIfsc))
      throw new BadRequestException(
        "Bank account number and IFSC must be supplied together"
      );
    const data: any = {
      ...(input.vehicleType !== undefined
        ? { vehicleType: input.vehicleType.trim() }
        : {}),
      ...(input.vehicleNumber !== undefined
        ? { vehicleNumber: input.vehicleNumber.trim().toUpperCase() }
        : {}),
      ...(input.emergencyContactName !== undefined
        ? { emergencyContactName: input.emergencyContactName.trim() }
        : {}),
      ...(input.emergencyContactPhone !== undefined
        ? { emergencyContactPhone: input.emergencyContactPhone }
        : {}),
    };
    if (input.bankAccountNumber && input.bankIfsc) {
      data.bankAccountCiphertext = this.encryptSensitive(
        input.bankAccountNumber
      );
      data.bankIfscCiphertext = this.encryptSensitive(
        input.bankIfsc.toUpperCase()
      );
      data.bankAccountLast4 = input.bankAccountNumber.slice(-4);
      data.bankStatus = "PENDING";
    }
    const updated = await prisma.riderProfile.update({
      where: { id: rider.id },
      data,
      include: { user: true, documents: true },
    });
    return this.safeProfile(updated);
  }

  async addDocument(userId: string, input: RiderDocumentDto) {
    const rider = await this.rider(userId);
    if (!input.storageKey.startsWith(`evidence/${userId}/`))
      throw new BadRequestException(
        "Document evidence does not belong to this Rider"
      );
    return prisma.riderDocument.create({
      data: {
        riderProfileId: rider.id,
        type: input.type as any,
        storageKey: input.storageKey,
        documentNumberLast4: input.documentNumberLast4 || null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
    });
  }

  async support(userId: string) {
    const rider = await this.rider(userId);
    return prisma.riderSupportTicket.findMany({
      where: { riderProfileId: rider.id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
      orderBy: { updatedAt: "desc" },
    });
  }

  async supportTicket(userId: string, ticketId: string) {
    const rider = await this.rider(userId);
    const ticket = await prisma.riderSupportTicket.findFirst({
      where: { id: ticketId, riderProfileId: rider.id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!ticket) throw new NotFoundException("Support ticket not found");
    return ticket;
  }

  async createSupport(userId: string, input: RiderSupportTicketDto) {
    const rider = await this.rider(userId);
    if (
      input.deliveryJobId &&
      !(await prisma.deliveryJob.findFirst({
        where: { id: input.deliveryJobId, currentRiderId: rider.id },
      }))
    )
      throw new NotFoundException("Delivery job not found for this rider");
    return prisma.riderSupportTicket.create({
      data: {
        riderProfileId: rider.id,
        deliveryJobId: input.deliveryJobId || null,
        category: input.category,
        subject: input.subject.trim(),
        description: input.description.trim(),
        evidenceKeys: input.evidenceKeys || [],
        messages: {
          create: {
            senderUserId: userId,
            senderRole: Role.RIDER,
            body: input.description.trim(),
            evidenceKeys: input.evidenceKeys || [],
          },
        },
      },
      include: { messages: true },
    });
  }

  async addSupportMessage(
    userId: string,
    ticketId: string,
    input: RiderSupportMessageDto
  ) {
    const ticket = await this.supportTicket(userId, ticketId);
    if (["RESOLVED", "CLOSED"].includes(ticket.status))
      throw new ConflictException(
        "Closed support tickets cannot receive new messages"
      );
    const message = await prisma.riderSupportMessage.create({
      data: {
        ticketId,
        senderUserId: userId,
        senderRole: Role.RIDER,
        body: input.body.trim(),
        evidenceKeys: input.evidenceKeys || [],
      },
    });
    await prisma.riderSupportTicket.update({
      where: { id: ticketId },
      data: { status: "OPEN" },
    });
    return message;
  }

  async adminCreateShift(
    riderProfileId: string,
    input: AdminRiderShiftDto,
    adminUserId: string
  ) {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (startsAt >= endsAt)
      throw new BadRequestException("Shift start must be before shift end");
    if (
      !(await prisma.riderProfile.findUnique({ where: { id: riderProfileId } }))
    )
      throw new NotFoundException("Rider profile not found");
    const overlapping = await prisma.riderShift.findFirst({
      where: {
        riderProfileId,
        status: { in: ["SCHEDULED", "ACTIVE"] as any },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
    });
    if (overlapping)
      throw new ConflictException("Shift overlaps an existing Rider shift");
    return prisma.riderShift.create({
      data: {
        riderProfileId,
        startsAt,
        endsAt,
        note: input.note?.trim() || null,
        createdByUserId: adminUserId,
      },
    });
  }

  async adminCreateEarning(
    riderProfileId: string,
    input: AdminRiderEarningDto,
    adminUserId: string
  ) {
    if (
      !(await prisma.riderProfile.findUnique({ where: { id: riderProfileId } }))
    )
      throw new NotFoundException("Rider profile not found");
    if (input.deliveryJobId) {
      const job = await prisma.deliveryJob.findFirst({
        where: { id: input.deliveryJobId, currentRiderId: riderProfileId },
      });
      if (!job)
        throw new NotFoundException(
          "Delivery job does not belong to this Rider"
        );
    }
    try {
      return await prisma.riderEarning.create({
        data: {
          riderProfileId,
          deliveryJobId: input.deliveryJobId || null,
          type: input.type as any,
          amountPaise: input.amountPaise,
          reference: input.reference.trim(),
          earnedAt: input.earnedAt ? new Date(input.earnedAt) : new Date(),
          createdByUserId: adminUserId,
        },
      });
    } catch (error: any) {
      if (error?.code === "P2002")
        throw new ConflictException(
          "This earning reference already exists for the delivery"
        );
      throw error;
    }
  }

  async adminMarkEarningPaid(earningId: string, adminUserId: string) {
    const earning = await prisma.riderEarning.findUnique({
      where: { id: earningId },
    });
    if (!earning) throw new NotFoundException("Rider earning not found");
    if (earning.status === "PAID") return earning;
    return prisma.riderEarning.update({
      where: { id: earningId },
      data: { status: "PAID", paidAt: new Date(), paidByUserId: adminUserId },
    });
  }

  async adminReviewDocument(
    documentId: string,
    input: AdminRiderReviewDto,
    adminUserId: string
  ) {
    if (!(await prisma.riderDocument.findUnique({ where: { id: documentId } })))
      throw new NotFoundException("Rider document not found");
    return prisma.riderDocument.update({
      where: { id: documentId },
      data: {
        status: input.status,
        reviewNote: input.note?.trim() || null,
        reviewedByUserId: adminUserId,
        reviewedAt: new Date(),
      },
    });
  }

  async adminReviewProfile(
    riderProfileId: string,
    input: AdminRiderReviewDto,
    adminUserId: string
  ) {
    if (
      !(await prisma.riderProfile.findUnique({ where: { id: riderProfileId } }))
    )
      throw new NotFoundException("Rider profile not found");
    return prisma.riderProfile.update({
      where: { id: riderProfileId },
      data: {
        approvalStatus: input.status,
        approvalReviewedByUserId: adminUserId,
        approvalReviewedAt: new Date(),
      },
    });
  }

  async adminReviewBank(
    riderProfileId: string,
    input: AdminRiderReviewDto,
    adminUserId: string
  ) {
    const rider = await prisma.riderProfile.findUnique({
      where: { id: riderProfileId },
    });
    if (!rider) throw new NotFoundException("Rider profile not found");
    if (!rider.bankAccountCiphertext || !rider.bankIfscCiphertext)
      throw new BadRequestException(
        "Rider has not submitted protected bank details"
      );
    return prisma.riderProfile.update({
      where: { id: riderProfileId },
      data: {
        bankStatus: input.status,
        bankReviewedByUserId: adminUserId,
        bankReviewedAt: new Date(),
      },
      select: {
        id: true,
        bankAccountLast4: true,
        bankStatus: true,
        bankReviewedAt: true,
      },
    });
  }

  async adminSupportStatus(
    ticketId: string,
    status: string,
    _adminUserId: string
  ) {
    if (
      !(await prisma.riderSupportTicket.findUnique({ where: { id: ticketId } }))
    )
      throw new NotFoundException("Rider support ticket not found");
    return prisma.riderSupportTicket.update({
      where: { id: ticketId },
      data: { status: status as any },
    });
  }

  async adminSupportReply(
    ticketId: string,
    input: RiderSupportMessageDto,
    adminUserId: string
  ) {
    const ticket = await prisma.riderSupportTicket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) throw new NotFoundException("Rider support ticket not found");
    if (ticket.status === "CLOSED")
      throw new ConflictException(
        "Closed support tickets cannot receive new messages"
      );
    const message = await prisma.riderSupportMessage.create({
      data: {
        ticketId,
        senderUserId: adminUserId,
        senderRole: Role.ADMIN,
        body: input.body.trim(),
        evidenceKeys: input.evidenceKeys || [],
      },
    });
    await prisma.riderSupportTicket.update({
      where: { id: ticketId },
      data: { status: "IN_PROGRESS" },
    });
    return message;
  }
}
