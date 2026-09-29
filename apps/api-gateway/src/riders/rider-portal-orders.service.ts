/**
 * Dispatch offers, live deliveries and pickup tasks.
 *
 * Split out of the former rider-portal.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, prisma } from '@aagam/database';
import { PickupProblemDto, VerifyPickupDto } from './rider-portal.dto';
import { RiderPortalServiceBase, jobInclude } from './rider-portal.service.base';

export class RiderPortalOrdersService extends RiderPortalServiceBase {
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
        deliveryJob: {
          status: 'WAITING_FOR_DISPATCH' as any,
          order: { status: { notIn: ['CANCELLED', 'PAYMENT_FAILED', 'DELIVERED'] as any } },
        },
      },
      include: { deliveryJob: { include: jobInclude } },
      orderBy: { offeredAt: "asc" },
    });
  }

  async currentDelivery(userId: string) {
    const rider = await this.rider(userId);
    const jobs = await this.activeJobs(rider.id);
    const job = jobs[0];
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

  async currentDeliveries(userId: string) {
    const rider = await this.rider(userId);
    const jobs = await this.activeJobs(rider.id);
    return Promise.all(jobs.map(async (job) => {
      const operations = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT "id", "type"::text, "status"::text, "actorUserId", "actorRole"::text,
               CASE WHEN "type" = 'OTP_ISSUED'::"DeliveryOperationType"
                 THEN "details" - 'nonce' - 'salt' - 'codeHash'
                 ELSE "details" END AS "details",
               "createdAt"
        FROM "DeliveryOperation" WHERE "deliveryJobId" = ${job.id} ORDER BY "createdAt" ASC
      `);
      return { ...job, operations };
    }));
  }

  async pickup(userId: string) {
    const tasks = await this.pickups(userId);
    return tasks[0] || null;
  }

  async pickups(userId: string) {
    const rider = await this.rider(userId);
    const jobs = await prisma.deliveryJob.findMany({
      where: {
        currentRiderId: rider.id,
        status: { in: ["RIDER_AT_STORE", "PICKUP_VERIFIED"] as any },
        order: { status: { notIn: ['CANCELLED', 'PAYMENT_FAILED', 'DELIVERED'] as any } },
      },
      include: jobInclude,
      orderBy: [{ order: { deliveryWindowEnd: "asc" } }, { createdAt: "asc" }],
    });
    return Promise.all(jobs.map(async (job) => {
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
      const task = existing || (await prisma.riderPickupTask.create({
        data: { riderProfileId: rider.id, deliveryJobId: job.id, checklist },
      }));
      return { job, task };
    }));
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
}
