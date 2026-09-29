/**
 * Admin rider operations (shifts, earnings, reviews, support).
 *
 * Split out of the former rider-portal.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Role, prisma } from '@aagam/database';
import { AdminRiderEarningDto, AdminRiderReviewDto, AdminRiderShiftDto, RiderSupportMessageDto } from './rider-portal.dto';
import { RiderPortalServiceBase } from './rider-portal.service.base';

export class RiderPortalAdminService extends RiderPortalServiceBase {
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
