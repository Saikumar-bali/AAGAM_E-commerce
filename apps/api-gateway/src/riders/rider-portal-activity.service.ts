/**
 * Earnings, COD, performance, availability, profile and support.
 *
 * Split out of the former rider-portal.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Role, prisma } from '@aagam/database';
import { RiderAvailabilityEntryDto, RiderDocumentDto, RiderHistoryQueryDto, RiderProfileDto, RiderSupportMessageDto, RiderSupportTicketDto } from './rider-portal.dto';
import { RiderPortalServiceBase } from './rider-portal.service.base';

export class RiderPortalActivityService extends RiderPortalServiceBase {
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
}
