import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { prisma, Role } from "@aagam/database";
import {
  DeliveryEventType,
  DeliveryJobStatus,
  DispatchAssignmentStatus,
} from "@aagam/types";
import { DeliveryEventService } from "./delivery-event.service";
import {
  DeliveryJobService,
  ACTIVE_JOB_STATUSES,
} from "./delivery-job.service";
import { DeliveryWorkflowService } from "./delivery-workflow.service";

type Actor = { id: string; role: Role };

@Injectable()
export class DispatchAssignmentService {
  constructor(
    private readonly jobs: DeliveryJobService,
    private readonly workflow: DeliveryWorkflowService,
    private readonly events: DeliveryEventService
  ) {}

  private async assertDispatcher(job: any, actor: Actor) {
    if (actor.role === Role.ADMIN) return;
    if (actor.role === Role.STORE_OWNER && job.order.store.ownerId === actor.id)
      return;
    throw new ForbiddenException(
      "Only admin or the owning store can offer a delivery job"
    );
  }

  async offerForOrder(
    orderId: string,
    riderUserId: string,
    actor: Actor,
    expiresInSeconds = 60
  ) {
    const job = await this.jobs.createForPackedOrder(orderId, actor);
    if (!job) throw new NotFoundException("Delivery job not found");
    return this.offer(job.id, riderUserId, actor, expiresInSeconds);
  }

  async offer(
    deliveryJobId: string,
    riderUserId: string,
    actor: Actor,
    expiresInSeconds = 60
  ) {
    const safeExpiry = Math.max(
      15,
      Math.min(300, Math.floor(expiresInSeconds || 60))
    );

    try {
      return await prisma.$transaction(
        async (tx) => {
          const job = await tx.deliveryJob.findUnique({
            where: { id: deliveryJobId },
            include: { order: { include: { store: true } } },
          });
          if (!job) throw new NotFoundException("Delivery job not found");
          await this.assertDispatcher(job, actor);
          if (
            job.status !== DeliveryJobStatus.WAITING_FOR_DISPATCH ||
            job.currentRiderId
          ) {
            throw new ConflictException(
              "Delivery job is no longer waiting for dispatch"
            );
          }

          const riderUser = await tx.user.findUnique({
            where: { id: riderUserId },
          });
          if (!riderUser || riderUser.role !== Role.RIDER) {
            throw new BadRequestException("Selected user is not a rider");
          }
          const rider = await tx.riderProfile.findUnique({
            where: { userId: riderUserId },
          });
          if (!rider) throw new NotFoundException("Rider profile not found");
          if (rider.status !== "ONLINE") {
            throw new ConflictException("Rider must be online and available");
          }

          const activeJob = await tx.deliveryJob.findFirst({
            where: {
              currentRiderId: rider.id,
              status: { in: ACTIVE_JOB_STATUSES as any },
            },
            select: { id: true, orderId: true, status: true },
          });
          if (activeJob) {
            throw new ConflictException(
              `Rider already has active delivery ${activeJob.id}`
            );
          }

          const now = new Date();
          await tx.dispatchAssignment.updateMany({
            where: {
              deliveryJobId,
              status: DispatchAssignmentStatus.OFFERED,
              expiresAt: { lt: now },
            },
            data: {
              status: DispatchAssignmentStatus.EXPIRED,
              respondedAt: now,
            },
          });

          const assignment = await tx.dispatchAssignment.create({
            data: {
              deliveryJobId,
              riderProfileId: rider.id,
              status: DispatchAssignmentStatus.OFFERED,
              offeredAt: now,
              expiresAt: new Date(now.getTime() + safeExpiry * 1000),
              createdByUserId: actor.id,
            },
            include: {
              riderProfile: { include: { user: true } },
              deliveryJob: {
                include: {
                  order: {
                    include: {
                      customer: true,
                      store: true,
                      items: { include: { product: true } },
                    },
                  },
                },
              },
            },
          });

          await this.events.record(
            {
              deliveryJobId,
              assignmentId: assignment.id,
              eventType: DeliveryEventType.ASSIGNMENT_CREATED,
              actor,
              metadata: { riderProfileId: rider.id, riderUserId },
            },
            tx
          );
          await this.events.record(
            {
              deliveryJobId,
              assignmentId: assignment.id,
              eventType: DeliveryEventType.ASSIGNMENT_OFFERED,
              actor,
              metadata: {
                riderProfileId: rider.id,
                riderUserId,
                expiresInSeconds: safeExpiry,
              },
            },
            tx
          );

          return assignment;
        },
        { isolationLevel: "Serializable" as any }
      );
    } catch (error: any) {
      if (error?.code === "P2002") {
        throw new ConflictException(
          "This delivery already has an active assignment offer"
        );
      }
      throw error;
    }
  }

  async accept(assignmentId: string, riderUserId: string) {
    return prisma.$transaction(
      async (tx) => {
        const assignment = await tx.dispatchAssignment.findUnique({
          where: { id: assignmentId },
          include: {
            riderProfile: true,
            deliveryJob: { include: { order: { include: { store: true } } } },
          },
        });
        if (!assignment)
          throw new NotFoundException("Assignment offer not found");
        if (assignment.riderProfile.userId !== riderUserId) {
          throw new ForbiddenException(
            "This assignment was offered to another rider"
          );
        }
        if (assignment.status !== DispatchAssignmentStatus.OFFERED) {
          throw new ConflictException(
            `Assignment is already ${assignment.status}`
          );
        }
        if (
          assignment.expiresAt &&
          assignment.expiresAt.getTime() <= Date.now()
        ) {
          await tx.dispatchAssignment.update({
            where: { id: assignment.id },
            data: {
              status: DispatchAssignmentStatus.EXPIRED,
              respondedAt: new Date(),
            },
          });
          await this.events.record(
            {
              deliveryJobId: assignment.deliveryJobId,
              assignmentId: assignment.id,
              eventType: DeliveryEventType.ASSIGNMENT_EXPIRED,
              actor: { id: riderUserId, role: Role.RIDER },
            },
            tx
          );
          throw new ConflictException("Assignment offer has expired");
        }

        const activeJob = await tx.deliveryJob.findFirst({
          where: {
            currentRiderId: assignment.riderProfileId,
            id: { not: assignment.deliveryJobId },
            status: { in: ACTIVE_JOB_STATUSES as any },
          },
          select: { id: true },
        });
        if (activeJob) {
          throw new ConflictException(
            `Complete active delivery ${activeJob.id} before accepting another`
          );
        }

        const accepted = await tx.dispatchAssignment.updateMany({
          where: {
            id: assignment.id,
            status: DispatchAssignmentStatus.OFFERED,
          },
          data: {
            status: DispatchAssignmentStatus.ACCEPTED,
            respondedAt: new Date(),
          },
        });
        if (accepted.count !== 1) {
          throw new ConflictException(
            "Assignment was already answered by another request"
          );
        }

        await this.workflow.transitionWithinTransaction(
          tx,
          assignment.deliveryJobId,
          DeliveryJobStatus.RIDER_ASSIGNED,
          { id: riderUserId, role: Role.RIDER },
          {
            expectedStatus: DeliveryJobStatus.WAITING_FOR_DISPATCH,
            assignedRiderId: assignment.riderProfileId,
            skipRoleCheck: true,
            metadata: { assignmentId: assignment.id },
          }
        );

        await tx.riderProfile.update({
          where: { id: assignment.riderProfileId },
          data: { status: "BUSY" },
        });
        await tx.codLedger.updateMany({
          where: {
            deliveryJobId: assignment.deliveryJobId,
            riderHoldingBalancePaise: 0,
          },
          data: { riderId: assignment.riderProfileId },
        });
        await this.events.record(
          {
            deliveryJobId: assignment.deliveryJobId,
            assignmentId: assignment.id,
            eventType: DeliveryEventType.ASSIGNMENT_ACCEPTED,
            actor: { id: riderUserId, role: Role.RIDER },
            metadata: { riderProfileId: assignment.riderProfileId },
          },
          tx
        );

        const job = await tx.deliveryJob.findUnique({
          where: { id: assignment.deliveryJobId },
          include: {
            order: {
              include: {
                customer: true,
                store: true,
                items: { include: { product: true } },
                rider: { include: { user: true } },
              },
            },
            currentRider: { include: { user: true } },
            assignments: { orderBy: { createdAt: "desc" } },
          },
        });
        return {
          assignmentId: assignment.id,
          deliveryJobId: assignment.deliveryJobId,
          status: DispatchAssignmentStatus.ACCEPTED,
          deliveryJob: job,
          // Compatibility fields for current clients.
          ...(job?.order || {}),
        };
      },
      { isolationLevel: "Serializable" as any }
    );
  }

  async reject(assignmentId: string, riderUserId: string, reason?: string) {
    return prisma.$transaction(
      async (tx) => {
        const assignment = await tx.dispatchAssignment.findUnique({
          where: { id: assignmentId },
          include: { riderProfile: true, deliveryJob: true },
        });
        if (!assignment) throw new NotFoundException("Assignment not found");
        if (assignment.riderProfile.userId !== riderUserId) {
          throw new ForbiddenException(
            "This assignment belongs to another rider"
          );
        }
        if (
          ![
            DispatchAssignmentStatus.OFFERED,
            DispatchAssignmentStatus.ACCEPTED,
          ].includes(assignment.status as any)
        ) {
          throw new ConflictException(
            `Assignment is already ${assignment.status}`
          );
        }

        const previousStatus = assignment.status;
        const updated = await tx.dispatchAssignment.updateMany({
          where: { id: assignment.id, status: previousStatus },
          data: {
            status: DispatchAssignmentStatus.REJECTED,
            respondedAt: new Date(),
            rejectionReason: reason || null,
          },
        });
        if (updated.count !== 1)
          throw new ConflictException(
            "Assignment changed before rejection completed"
          );

        if (previousStatus === DispatchAssignmentStatus.ACCEPTED) {
          if (
            assignment.deliveryJob.status !== DeliveryJobStatus.RIDER_ASSIGNED
          ) {
            throw new BadRequestException(
              "Accepted assignment can only be rejected before travel begins"
            );
          }
          await this.workflow.transitionWithinTransaction(
            tx,
            assignment.deliveryJobId,
            DeliveryJobStatus.WAITING_FOR_DISPATCH,
            { id: riderUserId, role: Role.RIDER },
            {
              expectedStatus: DeliveryJobStatus.RIDER_ASSIGNED,
              skipRoleCheck: true,
              metadata: { assignmentId: assignment.id, reason: reason || null },
            }
          );
          await tx.riderProfile.update({
            where: { id: assignment.riderProfileId },
            data: { status: "ONLINE" },
          });
        }

        await this.events.record(
          {
            deliveryJobId: assignment.deliveryJobId,
            assignmentId: assignment.id,
            eventType: DeliveryEventType.ASSIGNMENT_REJECTED,
            actor: { id: riderUserId, role: Role.RIDER },
            metadata: { reason: reason || null, previousStatus },
          },
          tx
        );

        return {
          assignmentId: assignment.id,
          deliveryJobId: assignment.deliveryJobId,
          status: DispatchAssignmentStatus.REJECTED,
          reason: reason || null,
        };
      },
      { isolationLevel: "Serializable" as any }
    );
  }

  async findCurrentForOrderAndRider(orderId: string, riderUserId: string) {
    const rider = await prisma.riderProfile.findUnique({
      where: { userId: riderUserId },
    });
    if (!rider) throw new NotFoundException("Rider profile not found");
    const assignment = await prisma.dispatchAssignment.findFirst({
      where: {
        riderProfileId: rider.id,
        deliveryJob: { orderId },
        status: {
          in: [
            DispatchAssignmentStatus.OFFERED,
            DispatchAssignmentStatus.ACCEPTED,
          ] as any,
        },
      },
      include: { deliveryJob: true },
      orderBy: { createdAt: "desc" },
    });
    if (!assignment)
      throw new NotFoundException("No active assignment found for this order");
    return assignment;
  }
}
