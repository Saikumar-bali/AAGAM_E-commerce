import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { OrderStatus, Role, prisma } from "@aagam/database";
import { DeliveryJobStatusType, DeliveryProofDto } from "@aagam/types";
import { DeliveryJobService } from "./delivery-job.service";
import { DeliveryOperationsService } from "./delivery-operations.service";
import { DispatchAssignmentService } from "./dispatch-assignment.service";
import { DeliveryWorkflowService } from "./delivery-workflow.service";
import { OrderService } from "./order.service";

type Actor = { id: string; role: Role };
type LegacyDeliveryProofInput = {
  proofType?: string;
  code?: string;
  note?: string;
  latitude?: number;
  longitude?: number;
};

const ACTIVE_RIDER_ORDER_STATUSES = [
  OrderStatus.RIDER_ASSIGNED,
  OrderStatus.OUT_FOR_DELIVERY,
];
const DISPATCH_ASSIGNABLE_STATUSES: OrderStatus[] = [OrderStatus.PACKED];

@Injectable()
export class DispatchService {
  constructor(
    @Inject(DeliveryJobService)
    private readonly jobsOrOrderService: DeliveryJobService | OrderService,
    @Optional()
    @Inject(DispatchAssignmentService)
    private readonly assignments?: DispatchAssignmentService,
    @Optional()
    @Inject(DeliveryWorkflowService)
    private readonly workflow?: DeliveryWorkflowService,
    @Optional()
    @Inject(DeliveryOperationsService)
    private readonly operations?: DeliveryOperationsService
  ) {}

  private get legacyOrderService() {
    return this.jobsOrOrderService instanceof OrderService
      ? this.jobsOrOrderService
      : undefined;
  }

  private get jobs() {
    if (this.legacyOrderService) {
      throw new Error("Delivery job service is unavailable in legacy mode");
    }
    return this.jobsOrOrderService as DeliveryJobService;
  }

  private get assignmentService() {
    if (!this.assignments) {
      throw new Error("Dispatch assignment service is unavailable");
    }
    return this.assignments;
  }

  private get workflowService() {
    if (!this.workflow) {
      throw new Error("Delivery workflow service is unavailable");
    }
    return this.workflow;
  }

  async getBoard(actor: Actor): Promise<any> {
    if (this.legacyOrderService) {
      return this.getLegacyBoard(actor);
    }
    return this.jobs.getBoard(actor);
  }

  getRiderWorkspace(riderUserId: string) {
    return this.jobs.getRiderWorkspace(riderUserId);
  }

  offerAssignment(
    deliveryJobId: string,
    riderUserId: string,
    actor: Actor,
    expiresInSeconds?: number
  ) {
    return this.assignmentService.offer(
      deliveryJobId,
      riderUserId,
      actor,
      expiresInSeconds
    );
  }

  acceptOffer(assignmentId: string, riderUserId: string) {
    return this.assignmentService.accept(assignmentId, riderUserId);
  }

  rejectOffer(assignmentId: string, riderUserId: string, reason?: string) {
    return this.assignmentService.reject(assignmentId, riderUserId, reason);
  }

  transitionJob(
    deliveryJobId: string,
    nextStatus: DeliveryJobStatusType,
    actor: Actor,
    metadata?: Record<string, unknown>
  ) {
    return this.workflowService.transition(
      deliveryJobId,
      nextStatus,
      actor,
      metadata
    );
  }

  // Compatibility adapter retained for the current admin/store dispatch client.
  async assignPackedOrder(
    orderId: string,
    riderUserId: string,
    actor: Actor
  ): Promise<any> {
    if (this.legacyOrderService) {
      return this.legacyAssignPackedOrder(orderId, riderUserId, actor);
    }
    return this.assignmentService.offerForOrder(orderId, riderUserId, actor);
  }

  // Reassign: release the old rider (if any), then assign the new rider via
  // the standard dispatch flow so a DeliveryJob and DispatchAssignment are
  // created and the rider sees the offer in their workspace.
  async reassignOrder(
    orderId: string,
    riderUserId: string,
    actor: Actor
  ): Promise<any> {
    if (this.legacyOrderService) {
      return this.legacyReassignOrder(orderId, riderUserId, actor);
    }
    return this.reassignOrderDispatch(orderId, riderUserId, actor);
  }

  // Compatibility adapter retained while clients migrate from order IDs to
  // assignment IDs.
  async acceptAssignment(orderId: string, riderUserId: string): Promise<any> {
    if (this.legacyOrderService) {
      return this.legacyAcceptAssignment(orderId, riderUserId);
    }
    const assignment = await this.assignmentService.findCurrentForOrderAndRider(
      orderId,
      riderUserId
    );
    return this.assignmentService.accept(assignment.id, riderUserId);
  }

  async rejectAssignment(
    orderId: string,
    riderUserId: string,
    reason?: string
  ): Promise<any> {
    if (this.legacyOrderService) {
      return this.legacyRejectAssignment(orderId, riderUserId, reason);
    }
    const assignment = await this.assignmentService.findCurrentForOrderAndRider(
      orderId,
      riderUserId
    );
    return this.assignmentService.reject(assignment.id, riderUserId, reason);
  }

  async markPickedUp(orderId: string, riderUserId: string): Promise<any> {
    if (this.legacyOrderService) {
      return this.legacyMarkPickedUp(orderId, riderUserId);
    }
    const assignment = await this.assignmentService.findCurrentForOrderAndRider(
      orderId,
      riderUserId
    );
    if (!assignment.deliveryJob)
      throw new NotFoundException("Delivery job not found");
    if (assignment.status !== "ACCEPTED") {
      throw new ForbiddenException("Accept the assignment before pickup");
    }
    await this.workflowService.legacyPickup(assignment.deliveryJob.id, {
      id: riderUserId,
      role: Role.RIDER,
    });
    const detailedJob = await this.jobs.getByOrderId(orderId);
    if (!detailedJob)
      throw new NotFoundException("Delivery job not found after pickup");
    return { ...detailedJob.order, deliveryJob: detailedJob };
  }

  async markDelivered(
    orderId: string,
    riderUserId: string,
    proof: DeliveryProofDto | LegacyDeliveryProofInput = {}
  ): Promise<any> {
    if (this.legacyOrderService) {
      return this.legacyMarkDelivered(orderId, riderUserId, proof);
    }
    const assignment = await this.assignmentService.findCurrentForOrderAndRider(
      orderId,
      riderUserId
    );
    if (!assignment.deliveryJob)
      throw new NotFoundException("Delivery job not found");

    const deliveryProof = proof as DeliveryProofDto;

    if (this.operations) {
      await this.operations.completeDelivery(
        assignment.deliveryJob.id,
        { id: riderUserId, role: Role.RIDER },
        {
          otpCode: deliveryProof.code,
          proofType: deliveryProof.proofType,
          note: deliveryProof.note,
          riderConfirmed: deliveryProof.riderConfirmed,
          latitude: deliveryProof.latitude,
          longitude: deliveryProof.longitude,
          accuracyMetres: deliveryProof.accuracyMetres,
        },
        `legacy-deliver:${assignment.deliveryJob.id}:${assignment.id}`
      );
    } else {
      // Used only by isolated legacy unit construction. Production Nest wiring
      // always injects DeliveryOperationsService and enforces Phase 3 gates.
      await this.workflowService.legacyDeliver(
        assignment.deliveryJob.id,
        { id: riderUserId, role: Role.RIDER },
        deliveryProof
      );
    }

    const detailedJob = await this.jobs.getByOrderId(orderId);
    if (!detailedJob)
      throw new NotFoundException("Delivery job not found after completion");
    return { ...detailedJob.order, deliveryJob: detailedJob };
  }

  // Modern path: release the old rider, reset job to WAITING_FOR_DISPATCH,
  // then offer to the new rider.
  private async reassignOrderDispatch(
    orderId: string,
    riderUserId: string,
    actor: Actor
  ): Promise<any> {
    const job = await this.jobs.getByOrderId(orderId);
    if (job) {
      const oldRiderId = job.currentRiderId;
      if (oldRiderId) {
        // Transition the job back to WAITING_FOR_DISPATCH so the new rider
        // can be offered via the standard flow.
        await this.workflowService.transition(
          job.id,
          "WAITING_FOR_DISPATCH" as any,
          actor,
          { reason: "Admin reassigning rider" }
        ).catch(() => {});
        // Release the old rider's busyness if they have no other active jobs.
        const riderProfile = await prisma.riderProfile.findUnique({
          where: { id: oldRiderId },
        });
        if (riderProfile) {
          const otherActive = await prisma.deliveryJob.findFirst({
            where: {
              currentRiderId: oldRiderId,
              status: {
                notIn: ["WAITING_FOR_DISPATCH", "CANCELLED", "DELIVERED"] as any,
              },
            },
          });
          if (!otherActive) {
            await prisma.riderProfile.update({
              where: { id: oldRiderId },
              data: { status: "ONLINE" },
            });
          }
        }
      }
    }
    return this.assignmentService.offerForOrder(orderId, riderUserId, actor);
  }

  // Legacy path: release old rider on the order table, then assign new rider.
  private async legacyReassignOrder(
    orderId: string,
    riderUserId: string,
    actor: Actor
  ): Promise<any> {
    const orderService = this.legacyOrderService!;
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, riderId: true, storeId: true },
    });
    if (!order) throw new NotFoundException("Order not found");

    // Release old rider if one exists.
    if (order.riderId) {
      const oldRider = await prisma.riderProfile.findUnique({
        where: { id: order.riderId },
      });
      await prisma.order.update({
        where: { id: orderId },
        data: { riderId: null, status: OrderStatus.PACKED },
      });
      if (oldRider) {
        const otherActive = await prisma.order.findFirst({
          where: {
            riderId: oldRider.id,
            status: { in: ACTIVE_RIDER_ORDER_STATUSES },
          },
        });
        if (!otherActive) {
          await prisma.riderProfile.update({
            where: { id: oldRider.id },
            data: { status: "ONLINE" },
          });
        }
      }
    }

    return this.legacyAssignPackedOrder(orderId, riderUserId, actor);
  }

  private async getLegacyBoard(actor: Actor) {
    const storeWhere =
      actor.role === Role.STORE_OWNER ? { ownerId: actor.id } : {};
    const stores = await prisma.store.findMany({
      where: storeWhere,
      select: { id: true },
    });
    const storeIds = stores.map((store) => store.id);

    const orders = await prisma.order.findMany({
      where: {
        status: {
          in: [
            OrderStatus.PACKED,
            OrderStatus.RIDER_ASSIGNED,
            OrderStatus.OUT_FOR_DELIVERY,
          ],
        },
        ...(actor.role === Role.STORE_OWNER
          ? { storeId: { in: storeIds } }
          : {}),
      },
      include: {
        customer: { select: { name: true, email: true, phone: true } },
        store: {
          select: {
            id: true,
            name: true,
            ownerId: true,
            address: true,
            latitude: true,
            longitude: true,
          },
        },
        rider: {
          include: {
            user: {
              select: { id: true, name: true, phone: true, email: true },
            },
          },
        },
        items: {
          include: {
            product: { select: { name: true, image: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const riders = await prisma.riderProfile.findMany({
      where: { status: { in: ["ONLINE", "BUSY"] as any } },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    });

    const activeOrders = await prisma.order.groupBy({
      by: ["riderId"],
      where: {
        riderId: { not: null },
        status: { in: ACTIVE_RIDER_ORDER_STATUSES },
      },
      _count: { _all: true },
    });
    const activeByRiderId = new Map(
      activeOrders.map((row) => [row.riderId, row._count._all])
    );

    return {
      waitingForRider: orders.filter(
        (order) => order.status === OrderStatus.PACKED && !order.riderId
      ),
      activeDeliveries: orders.filter(
        (order) =>
          order.status === OrderStatus.RIDER_ASSIGNED ||
          order.status === OrderStatus.OUT_FOR_DELIVERY
      ),
      riders: riders.map((rider) => ({
        ...rider,
        activeOrderCount: activeByRiderId.get(rider.id) || 0,
        available:
          rider.status === "ONLINE" &&
          (activeByRiderId.get(rider.id) || 0) === 0,
      })),
    };
  }

  private async legacyAssignPackedOrder(
    orderId: string,
    riderUserId: string,
    actor: Actor
  ) {
    const orderService = this.legacyOrderService!;
    if (actor.role !== Role.ADMIN && actor.role !== Role.STORE_OWNER) {
      throw new ForbiddenException("Only admin or store owner can assign riders");
    }

    const riderUser = await prisma.user.findUnique({
      where: { id: riderUserId },
    });
    if (!riderUser) {
      throw new NotFoundException("Rider user not found");
    }

    // RiderProfile is the canonical check; User.role may remain CUSTOMER
    // for mobile-onboarded riders.
    const rider = await prisma.riderProfile.findUnique({
      where: { userId: riderUserId },
    });
    if (!rider) throw new NotFoundException("Rider profile not found");
    if (rider.status === "OFFLINE") {
      throw new BadRequestException("Rider is offline");
    }

    const activeOrder = await prisma.order.findFirst({
      where: {
        riderId: rider.id,
        status: { in: ACTIVE_RIDER_ORDER_STATUSES },
      },
      select: { id: true, status: true },
    });
    if (activeOrder) {
      throw new ConflictException(
        `Rider already has active order ${activeOrder.id}`
      );
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { store: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (actor.role === Role.STORE_OWNER && order.store.ownerId !== actor.id) {
      throw new ForbiddenException("Not allowed to assign rider for this store");
    }
    if (!DISPATCH_ASSIGNABLE_STATUSES.includes(order.status as OrderStatus)) {
      throw new BadRequestException(
        "Only ready-for-pickup orders can be assigned"
      );
    }
    if (order.riderId) throw new ConflictException("Order already has a rider");

    return prisma.$transaction(async (tx) => {
      const next = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.RIDER_ASSIGNED,
          riderId: rider.id,
          riderAssignedAt: new Date(),
        },
      });
      await orderService.recordStatusHistory(
        {
          orderId,
          fromStatus: order.status as OrderStatus,
          toStatus: OrderStatus.RIDER_ASSIGNED,
          actor,
          note: "Dispatcher assigned rider to ready order.",
          metadata: { riderProfileId: rider.id, riderUserId },
        },
        tx
      );
      await tx.riderProfile.update({
        where: { id: rider.id },
        data: { status: "BUSY" },
      });
      return next;
    });
  }

  private async legacyAcceptAssignment(
    orderId: string,
    riderUserId: string
  ) {
    const orderService = this.legacyOrderService!;
    const { order, rider } = await this.legacyAssignedOrder(
      orderId,
      riderUserId
    );
    if (order.status !== OrderStatus.RIDER_ASSIGNED) {
      throw new BadRequestException("Assignment is not active");
    }
    await orderService.recordStatusHistory({
      orderId,
      fromStatus: order.status as OrderStatus,
      toStatus: order.status as OrderStatus,
      actor: { id: riderUserId, role: Role.RIDER },
      note: "Rider accepted the assignment.",
      metadata: {
        riderProfileId: rider.id,
        event: "RIDER_ACCEPTED_ASSIGNMENT",
      },
    });
    return orderService.findOne(orderId, {
      id: riderUserId,
      role: Role.RIDER,
    });
  }

  private async legacyRejectAssignment(
    orderId: string,
    riderUserId: string,
    reason?: string
  ) {
    const orderService = this.legacyOrderService!;
    const { order, rider } = await this.legacyAssignedOrder(
      orderId,
      riderUserId
    );
    if (order.status !== OrderStatus.RIDER_ASSIGNED) {
      throw new BadRequestException("Only assigned orders can be rejected");
    }

    return prisma.$transaction(async (tx) => {
      const next = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.PACKED,
          riderId: null,
          riderAssignedAt: null,
        },
      });
      await orderService.recordStatusHistory(
        {
          orderId,
          fromStatus: OrderStatus.RIDER_ASSIGNED,
          toStatus: OrderStatus.PACKED,
          actor: { id: riderUserId, role: Role.RIDER },
          note: "Rider rejected the assignment.",
          metadata: {
            riderProfileId: rider.id,
            reason: reason || null,
            event: "RIDER_REJECTED_ASSIGNMENT",
          },
        },
        tx
      );
      await tx.riderProfile.update({
        where: { id: rider.id },
        data: { status: "ONLINE" },
      });
      return next;
    });
  }

  private async legacyMarkPickedUp(orderId: string, riderUserId: string) {
    const { order } = await this.legacyAssignedOrder(orderId, riderUserId);
    if (order.status !== OrderStatus.RIDER_ASSIGNED) {
      throw new BadRequestException("Only assigned orders can be picked up");
    }
    return this.legacyOrderService!.updateStatus(
      orderId,
      OrderStatus.OUT_FOR_DELIVERY,
      { id: riderUserId, role: Role.RIDER }
    );
  }

  private async legacyMarkDelivered(
    orderId: string,
    riderUserId: string,
    proof: DeliveryProofDto | LegacyDeliveryProofInput
  ) {
    const orderService = this.legacyOrderService!;
    const { order, rider } = await this.legacyAssignedOrder(
      orderId,
      riderUserId
    );
    if (order.status !== OrderStatus.OUT_FOR_DELIVERY) {
      throw new BadRequestException(
        "Only out-for-delivery orders can be delivered"
      );
    }

    const delivered = await orderService.updateStatus(
      orderId,
      OrderStatus.DELIVERED,
      { id: riderUserId, role: Role.RIDER }
    );
    await orderService.recordStatusHistory({
      orderId,
      fromStatus: OrderStatus.DELIVERED,
      toStatus: OrderStatus.DELIVERED,
      actor: { id: riderUserId, role: Role.RIDER },
      note: "Rider submitted delivery proof.",
      metadata: {
        event: "DELIVERY_PROOF_RECORDED",
        riderProfileId: rider.id,
        proofType: proof.proofType || "RIDER_CONFIRMATION",
        code: proof.code || null,
        note: proof.note || null,
        latitude:
          typeof proof.latitude === "number" ? proof.latitude : null,
        longitude:
          typeof proof.longitude === "number" ? proof.longitude : null,
        submittedAt: new Date().toISOString(),
      },
    });
    return delivered;
  }

  private async legacyAssignedOrder(orderId: string, riderUserId: string) {
    const rider = await prisma.riderProfile.findUnique({
      where: { userId: riderUserId },
    });
    if (!rider) throw new NotFoundException("Rider profile not found");
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, riderId: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.riderId !== rider.id) {
      throw new ForbiddenException(
        "You can only manage your assigned orders"
      );
    }
    return { order, rider };
  }
}
