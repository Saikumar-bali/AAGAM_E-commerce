/**
 * Rider portal facade.
 *
 * Split out of the former rider-portal.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { Injectable } from '@nestjs/common';
import { prisma } from '@aagam/database';
import { AdminRiderEarningDto, AdminRiderReviewDto, AdminRiderShiftDto, PickupProblemDto, RiderAvailabilityEntryDto, RiderDocumentDto, RiderHistoryQueryDto, RiderProfileDto, RiderSupportMessageDto, RiderSupportTicketDto, VerifyPickupDto } from './rider-portal.dto';
import { RiderPortalServiceBase } from './rider-portal.service.base';
import { RiderPortalOrdersService } from './rider-portal-orders.service';
import { RiderPortalActivityService } from './rider-portal-activity.service';
import { RiderPortalAdminService } from './rider-portal-admin.service';

@Injectable()
export class RiderPortalService extends RiderPortalServiceBase {
  private readonly orders: RiderPortalOrdersService;
  private readonly activity: RiderPortalActivityService;
  private readonly admin: RiderPortalAdminService;

  constructor() {
    super();
    this.orders = new RiderPortalOrdersService();
    this.activity = new RiderPortalActivityService();
    this.admin = new RiderPortalAdminService();
  }

  async offers(userId: string) {
    return this.orders.offers(userId);
  }

  async currentDelivery(userId: string) {
    return this.orders.currentDelivery(userId);
  }

  async currentDeliveries(userId: string) {
    return this.orders.currentDeliveries(userId);
  }

  async pickup(userId: string) {
    return this.orders.pickup(userId);
  }

  async pickups(userId: string) {
    return this.orders.pickups(userId);
  }

  async verifyPickup(
    userId: string,
    deliveryJobId: string,
    input: VerifyPickupDto
  ) {
    return this.orders.verifyPickup(userId, deliveryJobId, input);
  }

  async reportPickupProblem(
    userId: string,
    deliveryJobId: string,
    input: PickupProblemDto
  ) {
    return this.orders.reportPickupProblem(userId, deliveryJobId, input);
  }

  async earnings(userId: string, query: RiderHistoryQueryDto) {
    return this.activity.earnings(userId, query);
  }

  async cod(userId: string) {
    return this.activity.cod(userId);
  }

  async performance(userId: string, query: RiderHistoryQueryDto) {
    return this.activity.performance(userId, query);
  }

  async availability(userId: string) {
    return this.activity.availability(userId);
  }

  async setStatus(userId: string, status: "ONLINE" | "OFFLINE") {
    return this.activity.setStatus(userId, status);
  }

  async setSchedule(userId: string, entries: RiderAvailabilityEntryDto[]) {
    return this.activity.setSchedule(userId, entries);
  }

  async startBreak(userId: string, reason?: string) {
    return this.activity.startBreak(userId, reason);
  }

  async endBreak(userId: string) {
    return this.activity.endBreak(userId);
  }

  async updateProfile(userId: string, input: RiderProfileDto) {
    return this.activity.updateProfile(userId, input);
  }

  async addDocument(userId: string, input: RiderDocumentDto) {
    return this.activity.addDocument(userId, input);
  }

  async support(userId: string) {
    return this.activity.support(userId);
  }

  async supportTicket(userId: string, ticketId: string) {
    return this.activity.supportTicket(userId, ticketId);
  }

  async createSupport(userId: string, input: RiderSupportTicketDto) {
    return this.activity.createSupport(userId, input);
  }

  async addSupportMessage(
    userId: string,
    ticketId: string,
    input: RiderSupportMessageDto
  ) {
    return this.activity.addSupportMessage(userId, ticketId, input);
  }

  async adminCreateShift(
    riderProfileId: string,
    input: AdminRiderShiftDto,
    adminUserId: string
  ) {
    return this.admin.adminCreateShift(riderProfileId, input, adminUserId);
  }

  async adminCreateEarning(
    riderProfileId: string,
    input: AdminRiderEarningDto,
    adminUserId: string
  ) {
    return this.admin.adminCreateEarning(riderProfileId, input, adminUserId);
  }

  async adminMarkEarningPaid(earningId: string, adminUserId: string) {
    return this.admin.adminMarkEarningPaid(earningId, adminUserId);
  }

  async adminReviewDocument(
    documentId: string,
    input: AdminRiderReviewDto,
    adminUserId: string
  ) {
    return this.admin.adminReviewDocument(documentId, input, adminUserId);
  }

  async adminReviewProfile(
    riderProfileId: string,
    input: AdminRiderReviewDto,
    adminUserId: string
  ) {
    return this.admin.adminReviewProfile(riderProfileId, input, adminUserId);
  }

  async adminReviewBank(
    riderProfileId: string,
    input: AdminRiderReviewDto,
    adminUserId: string
  ) {
    return this.admin.adminReviewBank(riderProfileId, input, adminUserId);
  }

  async adminSupportStatus(
    ticketId: string,
    status: string,
    _adminUserId: string
  ) {
    return this.admin.adminSupportStatus(ticketId, status, _adminUserId);
  }

  async adminSupportReply(
    ticketId: string,
    input: RiderSupportMessageDto,
    adminUserId: string
  ) {
    return this.admin.adminSupportReply(ticketId, input, adminUserId);
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
      activeJobs,
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
      this.activeJobs(rider.id),
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
      activeJobs,
      activeJob: activeJobs[0] || null,
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
}
