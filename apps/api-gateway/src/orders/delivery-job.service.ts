import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CodLedgerEntryType,
  OrderStatus,
  PaymentMethod,
  prisma,
  Role,
} from "@aagam/database";
import {
  DeliveryEventType,
  DeliveryJobStatus,
  DeliveryJobStatusType,
  DispatchAssignmentStatus,
} from "@aagam/types";
import { DeliveryEventService } from "./delivery-event.service";

type DbClient = typeof prisma | any;
type Actor = { id: string; role: Role };

const TERMINAL_JOB_STATUSES: DeliveryJobStatusType[] = [
  DeliveryJobStatus.DELIVERED,
  DeliveryJobStatus.RETURNED_TO_STORE,
  DeliveryJobStatus.CANCELLED,
];

const ACTIVE_JOB_STATUSES: DeliveryJobStatusType[] = [
  DeliveryJobStatus.RIDER_ASSIGNED,
  DeliveryJobStatus.RIDER_EN_ROUTE_TO_STORE,
  DeliveryJobStatus.RIDER_AT_STORE,
  DeliveryJobStatus.PICKUP_VERIFIED,
  DeliveryJobStatus.OUT_FOR_DELIVERY,
  DeliveryJobStatus.RIDER_AT_CUSTOMER,
  DeliveryJobStatus.DELIVERY_FAILED,
  DeliveryJobStatus.RETURNING_TO_STORE,
];

const jobInclude = {
  order: {
    include: {
      customer: { select: { id: true, name: true, email: true, phone: true } },
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
      payment: true,
      items: {
        include: {
          product: { select: { id: true, name: true, image: true } },
        },
      },
      rider: {
        include: {
          user: { select: { id: true, name: true, phone: true, email: true } },
        },
      },
    },
  },
  currentRider: {
    include: {
      user: { select: { id: true, name: true, phone: true, email: true } },
    },
  },
  assignments: {
    include: {
      riderProfile: {
        include: {
          user: { select: { id: true, name: true, phone: true, email: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" as const },
    take: 10,
  },
  codLedger: {
    include: { entries: { orderBy: { createdAt: "asc" as const } } },
  },
  pickupProof: true,
  deliveryProof: true,
  failureDecisions: { orderBy: { createdAt: "desc" as const }, take: 10 },
};

@Injectable()
export class DeliveryJobService {
  constructor(private readonly events: DeliveryEventService) {}

  private initialStatus(orderStatus: OrderStatus): DeliveryJobStatusType {
    if (orderStatus === OrderStatus.RIDER_ASSIGNED)
      return DeliveryJobStatus.RIDER_ASSIGNED;
    if (orderStatus === OrderStatus.OUT_FOR_DELIVERY)
      return DeliveryJobStatus.OUT_FOR_DELIVERY;
    if (orderStatus === OrderStatus.DELIVERED)
      return DeliveryJobStatus.DELIVERED;
    if (orderStatus === OrderStatus.CANCELLED)
      return DeliveryJobStatus.CANCELLED;
    return DeliveryJobStatus.WAITING_FOR_DISPATCH;
  }

  private async ensureCodLedger(job: any, actor: Actor, tx: DbClient) {
    if (job.codLedger || job.order.payment?.method !== PaymentMethod.COD)
      return;
    const ledger = await tx.codLedger.create({
      data: {
        deliveryJobId: job.id,
        orderId: job.orderId,
        riderId: job.currentRiderId,
        currency: job.order.payment.currency,
        expectedAmountPaise: job.order.payment.amountPaise,
      },
    });
    await tx.codLedgerEntry.create({
      data: {
        codLedgerId: ledger.id,
        type: CodLedgerEntryType.EXPECTED,
        amountPaise: job.order.payment.amountPaise,
        holdingAfterPaise: 0,
        depositedAfterPaise: 0,
        actorUserId: actor.id,
        actorRole: actor.role,
        idempotencyKey: `cod-expected:${job.id}`,
        metadata: { source: "ORDER_PAYMENT", paymentId: job.order.payment.id },
      },
    });
  }

  async ensureForPackedOrder(
    orderId: string,
    actor: Actor,
    tx: DbClient = prisma
  ) {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { store: { select: { ownerId: true } }, payment: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (actor.role === Role.STORE_OWNER && order.store.ownerId !== actor.id) {
      throw new ForbiddenException(
        "Not allowed to create a delivery job for this store"
      );
    }

    const allowedStatuses: OrderStatus[] = [
      OrderStatus.PACKED,
      OrderStatus.RIDER_ASSIGNED,
      OrderStatus.OUT_FOR_DELIVERY,
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
    ];
    if (!allowedStatuses.includes(order.status as OrderStatus)) {
      throw new ForbiddenException(
        "Delivery jobs are created only after the order is packed"
      );
    }

    const existing = await tx.deliveryJob.findUnique({
      where: { orderId },
      include: jobInclude,
    });
    if (existing) {
      await this.ensureCodLedger(existing, actor, tx);
      return tx.deliveryJob.findUnique({
        where: { id: existing.id },
        include: jobInclude,
      });
    }

    try {
      const created = await tx.deliveryJob.create({
        data: {
          orderId,
          status: this.initialStatus(order.status as OrderStatus),
          currentRiderId: order.riderId || null,
        },
        include: jobInclude,
      });
      await this.ensureCodLedger(created, actor, tx);
      await this.events.record(
        {
          deliveryJobId: created.id,
          eventType: DeliveryEventType.JOB_CREATED,
          toStatus: created.status,
          actor,
          metadata: {
            orderId,
            source: "ORDER_PACKED",
            legacyOrderStatus: order.status,
          },
        },
        tx
      );
      return tx.deliveryJob.findUnique({
        where: { id: created.id },
        include: jobInclude,
      });
    } catch (error: any) {
      if (error?.code === "P2002") {
        return tx.deliveryJob.findUnique({
          where: { orderId },
          include: jobInclude,
        });
      }
      throw error;
    }
  }

  createForPackedOrder(orderId: string, actor: Actor) {
    return prisma.$transaction(
      (tx) => this.ensureForPackedOrder(orderId, actor, tx),
      { isolationLevel: "Serializable" as any }
    );
  }

  async backfillDispatchableOrders(actor: Actor) {
    const orders = await prisma.order.findMany({
      where: {
        status: {
          in: [
            OrderStatus.PACKED,
            OrderStatus.RIDER_ASSIGNED,
            OrderStatus.OUT_FOR_DELIVERY,
          ],
        },
        deliveryJob: { is: null },
        ...(actor.role === Role.STORE_OWNER
          ? { store: { ownerId: actor.id } }
          : {}),
      },
      select: { id: true },
      take: 100,
    });

    for (const order of orders) {
      await this.createForPackedOrder(order.id, actor);
    }
  }

  getByOrderId(orderId: string) {
    return prisma.deliveryJob.findUnique({
      where: { orderId },
      include: jobInclude,
    });
  }

  getById(id: string) {
    return prisma.deliveryJob.findUnique({
      where: { id },
      include: jobInclude,
    });
  }

  async getBoard(actor: Actor) {
    if (actor.role !== Role.ADMIN && actor.role !== Role.STORE_OWNER) {
      throw new ForbiddenException(
        "Only admin or store owner can view dispatch operations"
      );
    }

    await this.backfillDispatchableOrders(actor);

    const jobs = await prisma.deliveryJob.findMany({
      where: {
        ...(actor.role === Role.STORE_OWNER
          ? { order: { store: { ownerId: actor.id } } }
          : {}),
      },
      include: jobInclude,
      orderBy: { createdAt: "asc" },
    });

    const riders = await prisma.riderProfile.findMany({
      where: { status: { in: ["ONLINE", "BUSY"] as any } },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    });

    const activeCounts = new Map<string, number>();
    for (const job of jobs) {
      if (job.currentRiderId && ACTIVE_JOB_STATUSES.includes(job.status)) {
        activeCounts.set(
          job.currentRiderId,
          (activeCounts.get(job.currentRiderId) || 0) + 1
        );
      }
    }

    const waitingJobs = jobs.filter(
      (job) => job.status === DeliveryJobStatus.WAITING_FOR_DISPATCH
    );
    const activeJobs = jobs.filter((job) =>
      ACTIVE_JOB_STATUSES.includes(job.status)
    );
    const completedJobs = jobs.filter((job) =>
      TERMINAL_JOB_STATUSES.includes(job.status)
    );

    return {
      waitingJobs,
      activeJobs,
      completedJobs,
      openOffers: waitingJobs.flatMap((job) =>
        job.assignments.filter((assignment) =>
          [
            DispatchAssignmentStatus.CREATED,
            DispatchAssignmentStatus.OFFERED,
          ].includes(assignment.status as any)
        )
      ),
      riders: riders.map((rider) => {
        const activeJobCount = activeCounts.get(rider.id) || 0;
        return {
          ...rider,
          activeJobCount,
          activeOrderCount: activeJobCount,
          available: rider.status === "ONLINE" && activeJobCount === 0,
        };
      }),
      // Compatibility fields retained while clients move to delivery-job DTOs.
      waitingForRider: waitingJobs.map((job) => ({
        ...job.order,
        deliveryJob: job,
      })),
      activeDeliveries: activeJobs.map((job) => ({
        ...job.order,
        deliveryJob: job,
        rider: job.currentRider || job.order.rider,
      })),
    };
  }

  async getRiderWorkspace(riderUserId: string) {
    const rider = await prisma.riderProfile.findUnique({
      where: { userId: riderUserId },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
      },
    });
    if (!rider) throw new NotFoundException("Rider profile not found");

    const now = new Date();
    await prisma.dispatchAssignment.updateMany({
      where: {
        riderProfileId: rider.id,
        status: DispatchAssignmentStatus.OFFERED,
        expiresAt: { lt: now },
      },
      data: { status: DispatchAssignmentStatus.EXPIRED, respondedAt: now },
    });

    const [pendingOffers, activeJob, assignmentHistory] = await Promise.all([
      prisma.dispatchAssignment.findMany({
        where: {
          riderProfileId: rider.id,
          status: DispatchAssignmentStatus.OFFERED,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        include: {
          deliveryJob: { include: jobInclude },
        },
        orderBy: { offeredAt: "asc" },
      }),
      prisma.deliveryJob.findFirst({
        where: {
          currentRiderId: rider.id,
          status: { in: ACTIVE_JOB_STATUSES as any },
        },
        include: jobInclude,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.dispatchAssignment.findMany({
        where: { riderProfileId: rider.id },
        include: {
          deliveryJob: { include: { order: { include: { store: true } } } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    return {
      rider,
      pendingOffers,
      activeJob,
      assignmentHistory,
    };
  }
}

export { ACTIVE_JOB_STATUSES, TERMINAL_JOB_STATUSES };
