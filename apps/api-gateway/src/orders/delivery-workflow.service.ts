import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { OrderStatus, prisma, Role } from "@aagam/database";
import {
  DeliveryEventType,
  DeliveryJobStatus,
  DeliveryJobStatusType,
} from "@aagam/types";
import { DeliveryEventService } from "./delivery-event.service";

type DbClient = typeof prisma | any;
type Actor = { id: string; role: Role };

type TransitionOptions = {
  expectedStatus?: DeliveryJobStatusType;
  assignedRiderId?: string | null;
  skipRoleCheck?: boolean;
  metadata?: Record<string, unknown>;
};

const TRANSITIONS: Record<DeliveryJobStatusType, DeliveryJobStatusType[]> = {
  WAITING_FOR_DISPATCH: ["RIDER_ASSIGNED", "CANCELLED"],
  RIDER_ASSIGNED: [
    "RIDER_EN_ROUTE_TO_STORE",
    "WAITING_FOR_DISPATCH",
    "CANCELLED",
  ],
  RIDER_EN_ROUTE_TO_STORE: ["RIDER_AT_STORE", "DELIVERY_FAILED", "CANCELLED"],
  RIDER_AT_STORE: ["PICKUP_VERIFIED", "DELIVERY_FAILED", "CANCELLED"],
  PICKUP_VERIFIED: ["OUT_FOR_DELIVERY", "CANCELLED"],
  OUT_FOR_DELIVERY: [
    "RIDER_AT_CUSTOMER",
    "DELIVERED",
    "DELIVERY_FAILED",
    "RETURNING_TO_STORE",
    "CANCELLED",
  ],
  RIDER_AT_CUSTOMER: [
    "DELIVERED",
    "DELIVERY_FAILED",
    "RETURNING_TO_STORE",
    "CANCELLED",
  ],
  DELIVERED: [],
  DELIVERY_FAILED: [
    "WAITING_FOR_DISPATCH",
    "OUT_FOR_DELIVERY",
    "RETURNING_TO_STORE",
    "CANCELLED",
  ],
  RETURNING_TO_STORE: ["RETURNED_TO_STORE", "CANCELLED"],
  RETURNED_TO_STORE: ["WAITING_FOR_DISPATCH", "CANCELLED"],
  CANCELLED: [],
};

const RIDER_TRANSITIONS = new Set([
  "RIDER_ASSIGNED:RIDER_EN_ROUTE_TO_STORE",
  "RIDER_EN_ROUTE_TO_STORE:RIDER_AT_STORE",
  "PICKUP_VERIFIED:OUT_FOR_DELIVERY",
  "OUT_FOR_DELIVERY:RIDER_AT_CUSTOMER",
  "OUT_FOR_DELIVERY:DELIVERY_FAILED",
  "RIDER_AT_CUSTOMER:DELIVERED",
  "RIDER_AT_CUSTOMER:DELIVERY_FAILED",
  "DELIVERY_FAILED:RETURNING_TO_STORE",
  "RETURNING_TO_STORE:RETURNED_TO_STORE",
]);

const STORE_TRANSITIONS = new Set(["RIDER_AT_STORE:PICKUP_VERIFIED"]);

@Injectable()
export class DeliveryWorkflowService {
  constructor(private readonly events: DeliveryEventService) {}

  private legacyOrderStatus(status: DeliveryJobStatusType): OrderStatus {
    if (status === DeliveryJobStatus.WAITING_FOR_DISPATCH)
      return OrderStatus.PACKED;
    if (
      [
        DeliveryJobStatus.RIDER_ASSIGNED,
        DeliveryJobStatus.RIDER_EN_ROUTE_TO_STORE,
        DeliveryJobStatus.RIDER_AT_STORE,
        DeliveryJobStatus.PICKUP_VERIFIED,
      ].includes(status)
    ) {
      return OrderStatus.RIDER_ASSIGNED;
    }
    if (
      [
        DeliveryJobStatus.OUT_FOR_DELIVERY,
        DeliveryJobStatus.RIDER_AT_CUSTOMER,
        DeliveryJobStatus.DELIVERY_FAILED,
        DeliveryJobStatus.RETURNING_TO_STORE,
        DeliveryJobStatus.RETURNED_TO_STORE,
      ].includes(status)
    ) {
      return OrderStatus.OUT_FOR_DELIVERY;
    }
    if (status === DeliveryJobStatus.DELIVERED) return OrderStatus.DELIVERED;
    return OrderStatus.CANCELLED;
  }

  private timestampData(status: OrderStatus) {
    if (status === OrderStatus.RIDER_ASSIGNED)
      return { riderAssignedAt: new Date() };
    if (status === OrderStatus.OUT_FOR_DELIVERY)
      return { outForDeliveryAt: new Date() };
    if (status === OrderStatus.DELIVERED) return { deliveredAt: new Date() };
    if (status === OrderStatus.CANCELLED) return { cancelledAt: new Date() };
    return {};
  }

  private transitionNote(nextStatus: DeliveryJobStatusType) {
    const notes: Partial<Record<DeliveryJobStatusType, string>> = {
      WAITING_FOR_DISPATCH: "Delivery returned to dispatch queue.",
      RIDER_ASSIGNED: "Rider accepted the delivery assignment.",
      RIDER_EN_ROUTE_TO_STORE: "Rider is travelling to the store.",
      RIDER_AT_STORE: "Rider arrived at the store.",
      PICKUP_VERIFIED: "Store verified the parcel handoff.",
      OUT_FOR_DELIVERY: "Parcel left the store and is out for delivery.",
      RIDER_AT_CUSTOMER: "Rider arrived at the customer location.",
      DELIVERED: "Delivery completed.",
      DELIVERY_FAILED: "Delivery attempt failed.",
      RETURNING_TO_STORE: "Rider is returning the parcel to the store.",
      RETURNED_TO_STORE: "Parcel returned to the store.",
      CANCELLED: "Delivery job cancelled.",
    };
    return notes[nextStatus] || `Delivery changed to ${nextStatus}.`;
  }

  private async assertRole(
    job: any,
    nextStatus: DeliveryJobStatusType,
    actor: Actor,
    tx: DbClient
  ) {
    if (actor.role === Role.ADMIN) return;

    const key = `${job.status}:${nextStatus}`;
    if (actor.role === Role.STORE_OWNER) {
      if (job.order.store.ownerId !== actor.id) {
        throw new ForbiddenException(
          "Not allowed to update deliveries for this store"
        );
      }
      if (!STORE_TRANSITIONS.has(key)) {
        throw new ForbiddenException(`Store transition not allowed: ${key}`);
      }
      return;
    }

    if (actor.role === Role.RIDER) {
      const rider = await tx.riderProfile.findUnique({
        where: { userId: actor.id },
      });
      if (!rider || job.currentRiderId !== rider.id) {
        throw new ForbiddenException(
          "You can only update your active delivery"
        );
      }
      if (!RIDER_TRANSITIONS.has(key)) {
        throw new ForbiddenException(`Rider transition not allowed: ${key}`);
      }
      return;
    }

    throw new ForbiddenException("Role cannot update delivery jobs");
  }

  private async finalizeDeliveredInventory(
    tx: DbClient,
    order: any,
    actor: Actor
  ) {
    const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
    for (const item of items) {
      const existing = await tx.inventory.findUnique({
        where: {
          storeId_productId: {
            storeId: order.storeId,
            productId: item.productId,
          },
        },
      });
      const quantity = existing?.quantity ?? 0;
      await tx.inventoryLedger.create({
        data: {
          storeId: order.storeId,
          productId: item.productId,
          orderId: order.id,
          reason: "ORDER_DELIVERED_FINALIZE",
          quantityDelta: 0,
          previousQuantity: quantity,
          newQuantity: quantity,
          actorUserId: actor.id,
          note: `Delivery job finalized order ${order.id}: ${item.quantity} units`,
        },
      });
    }
  }

  async transitionWithinTransaction(
    tx: DbClient,
    deliveryJobId: string,
    nextStatus: DeliveryJobStatusType,
    actor: Actor,
    options: TransitionOptions = {}
  ) {
    const job = await tx.deliveryJob.findUnique({
      where: { id: deliveryJobId },
      include: {
        order: { include: { store: { select: { ownerId: true } } } },
      },
    });
    if (!job) throw new NotFoundException("Delivery job not found");

    const currentStatus = job.status as DeliveryJobStatusType;
    if (options.expectedStatus && currentStatus !== options.expectedStatus) {
      throw new ConflictException(
        `Delivery job changed from ${options.expectedStatus} to ${currentStatus}`
      );
    }
    if (currentStatus === nextStatus) return job;

    const allowed = TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(nextStatus)) {
      throw new BadRequestException(
        `Cannot transition delivery from ${currentStatus} to ${nextStatus}`
      );
    }
    if (!options.skipRoleCheck) {
      await this.assertRole(job, nextStatus, actor, tx);
    }

    const updateData: any = {
      status: nextStatus,
      version: { increment: 1 },
    };
    if (options.assignedRiderId !== undefined) {
      updateData.currentRiderId = options.assignedRiderId;
    }
    if (nextStatus === DeliveryJobStatus.WAITING_FOR_DISPATCH) {
      updateData.currentRiderId = null;
    }

    const changed = await tx.deliveryJob.updateMany({
      where: { id: deliveryJobId, status: currentStatus, version: job.version },
      data: updateData,
    });
    if (changed.count !== 1) {
      throw new ConflictException(
        "Delivery job was updated by another request"
      );
    }

    const legacyStatus = this.legacyOrderStatus(nextStatus);
    const orderData: any = {
      status: legacyStatus,
      ...this.timestampData(legacyStatus),
    };
    const effectiveRiderId =
      options.assignedRiderId !== undefined
        ? options.assignedRiderId
        : job.currentRiderId;
    if (legacyStatus === OrderStatus.PACKED) {
      orderData.riderId = null;
      orderData.riderAssignedAt = null;
    } else if (effectiveRiderId) {
      orderData.riderId = effectiveRiderId;
    }

    await tx.order.update({ where: { id: job.orderId }, data: orderData });
    await tx.orderStatusHistory.create({
      data: {
        orderId: job.orderId,
        fromStatus: job.order.status,
        toStatus: legacyStatus,
        actorUserId: actor.id,
        actorRole: actor.role,
        note: this.transitionNote(nextStatus),
        metadata: {
          deliveryJobId,
          deliveryFromStatus: currentStatus,
          deliveryToStatus: nextStatus,
          ...(options.metadata || {}),
        },
      },
    });

    await this.events.record(
      {
        deliveryJobId,
        eventType: DeliveryEventType.JOB_STATUS_CHANGED,
        fromStatus: currentStatus,
        toStatus: nextStatus,
        actor,
        metadata: options.metadata,
      },
      tx
    );

    if (
      nextStatus === DeliveryJobStatus.WAITING_FOR_DISPATCH ||
      nextStatus === DeliveryJobStatus.DELIVERED ||
      nextStatus === DeliveryJobStatus.RETURNED_TO_STORE ||
      nextStatus === DeliveryJobStatus.CANCELLED
    ) {
      if (job.currentRiderId) {
        await tx.riderProfile.updateMany({
          where: { id: job.currentRiderId },
          data: { status: "ONLINE" },
        });
      }
    }

    if (nextStatus === DeliveryJobStatus.DELIVERED) {
      await this.finalizeDeliveredInventory(tx, job.order, actor);
    }

    return tx.deliveryJob.findUnique({
      where: { id: deliveryJobId },
      include: {
        order: true,
        currentRider: { include: { user: true } },
        assignments: { orderBy: { createdAt: "desc" } },
      },
    });
  }

  transition(
    deliveryJobId: string,
    nextStatus: DeliveryJobStatusType,
    actor: Actor,
    metadata?: Record<string, unknown>
  ) {
    return prisma.$transaction(
      (tx) =>
        this.transitionWithinTransaction(tx, deliveryJobId, nextStatus, actor, {
          metadata,
        }),
      { isolationLevel: "Serializable" as any }
    );
  }

  async legacyPickup(deliveryJobId: string, actor: Actor) {
    return prisma.$transaction(
      async (tx) => {
        let job = await tx.deliveryJob.findUnique({
          where: { id: deliveryJobId },
        });
        if (!job) throw new NotFoundException("Delivery job not found");
        const sequence: DeliveryJobStatusType[] = [];
        if (job.status === DeliveryJobStatus.RIDER_ASSIGNED) {
          sequence.push(
            DeliveryJobStatus.RIDER_EN_ROUTE_TO_STORE,
            DeliveryJobStatus.RIDER_AT_STORE
          );
        } else if (job.status === DeliveryJobStatus.RIDER_EN_ROUTE_TO_STORE) {
          sequence.push(DeliveryJobStatus.RIDER_AT_STORE);
        }
        if (
          [
            DeliveryJobStatus.RIDER_ASSIGNED,
            DeliveryJobStatus.RIDER_EN_ROUTE_TO_STORE,
            DeliveryJobStatus.RIDER_AT_STORE,
          ].includes(job.status)
        ) {
          sequence.push(
            DeliveryJobStatus.PICKUP_VERIFIED,
            DeliveryJobStatus.OUT_FOR_DELIVERY
          );
        } else if (job.status === DeliveryJobStatus.PICKUP_VERIFIED) {
          sequence.push(DeliveryJobStatus.OUT_FOR_DELIVERY);
        }
        if (sequence.length === 0) {
          throw new BadRequestException("Delivery is not ready for pickup");
        }
        for (const status of sequence) {
          job = await this.transitionWithinTransaction(
            tx,
            deliveryJobId,
            status,
            actor,
            {
              skipRoleCheck: true,
              metadata: { legacyAdapter: true },
            }
          );
        }
        await this.events.record(
          {
            deliveryJobId,
            eventType: DeliveryEventType.LEGACY_ADAPTER_USED,
            actor,
            metadata: { adapter: "rider/pickup" },
          },
          tx
        );
        return job;
      },
      { isolationLevel: "Serializable" as any }
    );
  }

  async legacyDeliver(
    deliveryJobId: string,
    actor: Actor,
    proof: Record<string, unknown> = {}
  ) {
    return prisma.$transaction(
      async (tx) => {
        let job = await tx.deliveryJob.findUnique({
          where: { id: deliveryJobId },
        });
        if (!job) throw new NotFoundException("Delivery job not found");
        if (job.status === DeliveryJobStatus.OUT_FOR_DELIVERY) {
          job = await this.transitionWithinTransaction(
            tx,
            deliveryJobId,
            DeliveryJobStatus.RIDER_AT_CUSTOMER,
            actor,
            {
              skipRoleCheck: true,
              metadata: { legacyAdapter: true },
            }
          );
        }
        job = await this.transitionWithinTransaction(
          tx,
          deliveryJobId,
          DeliveryJobStatus.DELIVERED,
          actor,
          {
            skipRoleCheck: true,
            metadata: { legacyAdapter: true, deliveryProof: proof },
          }
        );
        await this.events.record(
          {
            deliveryJobId,
            eventType: DeliveryEventType.LEGACY_ADAPTER_USED,
            actor,
            metadata: { adapter: "rider/deliver", deliveryProof: proof },
          },
          tx
        );
        return job;
      },
      { isolationLevel: "Serializable" as any }
    );
  }
}

export { TRANSITIONS as DELIVERY_JOB_TRANSITIONS };
