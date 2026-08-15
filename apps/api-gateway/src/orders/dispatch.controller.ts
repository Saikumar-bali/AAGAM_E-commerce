import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  GoneException,
  Headers,
  NotFoundException,
  Param,
  Patch,
  Query,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { prisma, Role } from "@aagam/database";
import {
  DeliveryEventType,
  DeliveryJobStatus,
  DeliveryProofSchema,
  DispatchAssignmentStatus,
  OfferDispatchAssignmentSchema,
  RejectDispatchAssignmentSchema,
} from "@aagam/types";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { DeliveryEventService } from "./delivery-event.service";
import { ACTIVE_JOB_STATUSES } from "./delivery-job.service";
import { DeliveryOperationsService } from "./delivery-operations.service";
import { ConfirmStoreHandoffDto } from "./delivery-operations.dto";
import { DeliveryWorkflowService } from "./delivery-workflow.service";
import { DispatchService } from "./dispatch.service";
import { canAddOrderFromStore } from "./same-store-multi-order";

type Actor = { id: string; role: Role };

@Controller("orders/dispatch")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DispatchController {
  constructor(
    private readonly dispatch: DispatchService,
    private readonly operations: DeliveryOperationsService,
    private readonly workflow: DeliveryWorkflowService,
    private readonly events: DeliveryEventService
  ) {}

  private parse<T>(
    schema: { safeParse(value: unknown): any },
    value: unknown
  ): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid delivery request",
        errors: parsed.error.issues,
      });
    }
    return parsed.data as T;
  }

  private async reassignAtomically(
    orderId: string,
    riderUserId: string,
    actor: Actor
  ) {
    const now = new Date();

    try {
      return await prisma.$transaction(
        async (tx) => {
          const lockedJobs = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id"
            FROM "DeliveryJob"
            WHERE "orderId" = ${orderId}
            FOR UPDATE
          `;
          if (lockedJobs.length === 0) {
            throw new NotFoundException("Delivery job not found");
          }

          const job = await tx.deliveryJob.findUnique({
            where: { id: lockedJobs[0].id },
            include: { order: { include: { store: true } } },
          });
          if (!job) throw new NotFoundException("Delivery job not found");
          if (
            job.status !== DeliveryJobStatus.RIDER_ASSIGNED ||
            !job.currentRiderId
          ) {
            throw new ConflictException(
              "Only a rider-assigned delivery can be reassigned"
            );
          }

          const lockedRiders = await tx.$queryRaw<
            Array<{ id: string; status: string }>
          >`
            SELECT "id", "status"
            FROM "RiderProfile"
            WHERE "userId" = ${riderUserId}
            FOR UPDATE
          `;
          const rider = lockedRiders[0];
          if (!rider) throw new NotFoundException("Rider profile not found");
          if (rider.id === job.currentRiderId) {
            throw new ConflictException(
              "Replacement rider is already assigned to this delivery"
            );
          }
          if (rider.status !== "ONLINE" && rider.status !== "BUSY") {
            throw new ConflictException("Rider must be online or carrying orders from this store");
          }

          const activeJobs = await tx.deliveryJob.findMany({
            where: {
              id: { not: job.id },
              currentRiderId: rider.id,
              status: { in: ACTIVE_JOB_STATUSES as any },
            },
            select: { status: true, order: { select: { storeId: true } } },
          });
          if (!canAddOrderFromStore(
            activeJobs.map((activeJob) => ({
              storeId: activeJob.order.storeId,
              status: activeJob.status,
            })),
            job.order.storeId,
          )) {
            throw new ConflictException(
              "Rider can only receive additional pre-pickup orders from the same store"
            );
          }

          const expiredOffers = await tx.dispatchAssignment.findMany({
            where: {
              riderProfileId: rider.id,
              status: DispatchAssignmentStatus.OFFERED,
              expiresAt: { lt: now },
            },
            select: {
              id: true,
              deliveryJobId: true,
              riderProfileId: true,
              expiresAt: true,
            },
          });
          for (const expiredOffer of expiredOffers) {
            const changed = await tx.dispatchAssignment.updateMany({
              where: {
                id: expiredOffer.id,
                status: DispatchAssignmentStatus.OFFERED,
                expiresAt: { lt: now },
              },
              data: {
                status: DispatchAssignmentStatus.EXPIRED,
                respondedAt: now,
              },
            });
            if (changed.count !== 1) continue;
            await this.events.record(
              {
                deliveryJobId: expiredOffer.deliveryJobId,
                assignmentId: expiredOffer.id,
                eventType: DeliveryEventType.ASSIGNMENT_EXPIRED,
                actor: { id: null, role: Role.ADMIN },
                metadata: {
                  source: "ATOMIC_REASSIGN_RIDER_RECONCILER",
                  riderProfileId: expiredOffer.riderProfileId,
                  expiresAt: expiredOffer.expiresAt?.toISOString() || null,
                },
              },
              tx
            );
          }

          const otherOpenOffer = await tx.dispatchAssignment.findFirst({
            where: {
              riderProfileId: rider.id,
              status: DispatchAssignmentStatus.OFFERED,
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            select: { id: true },
          });
          if (otherOpenOffer) {
            throw new ConflictException(
              `Rider already has active offer ${otherOpenOffer.id}`
            );
          }

          await tx.dispatchAssignment.updateMany({
            where: {
              deliveryJobId: job.id,
              status: {
                in: [
                  DispatchAssignmentStatus.OFFERED,
                  DispatchAssignmentStatus.ACCEPTED,
                ] as any,
              },
            },
            data: {
              status: DispatchAssignmentStatus.REASSIGNED,
              respondedAt: now,
            },
          });

          await this.workflow.transitionWithinTransaction(
            tx,
            job.id,
            DeliveryJobStatus.WAITING_FOR_DISPATCH,
            actor,
            {
              expectedStatus: DeliveryJobStatus.RIDER_ASSIGNED,
              metadata: {
                reason: "Admin reassigning rider",
                replacementRiderProfileId: rider.id,
              },
            }
          );

          const assignment = await tx.dispatchAssignment.create({
            data: {
              deliveryJobId: job.id,
              riderProfileId: rider.id,
              status: DispatchAssignmentStatus.OFFERED,
              offeredAt: now,
              expiresAt: new Date(now.getTime() + 60_000),
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
              deliveryJobId: job.id,
              assignmentId: assignment.id,
              eventType: DeliveryEventType.ASSIGNMENT_CREATED,
              actor,
              metadata: { riderProfileId: rider.id, riderUserId },
            },
            tx
          );
          await this.events.record(
            {
              deliveryJobId: job.id,
              assignmentId: assignment.id,
              eventType: DeliveryEventType.ASSIGNMENT_OFFERED,
              actor,
              metadata: {
                riderProfileId: rider.id,
                riderUserId,
                expiresInSeconds: 60,
                source: "ATOMIC_ADMIN_REASSIGNMENT",
              },
            },
            tx
          );

          return assignment;
        },
        { isolationLevel: "Serializable" as any }
      );
    } catch (error: any) {
      if (error?.code === "P2002" || error?.code === "P2034") {
        throw new ConflictException(
          "Rider availability changed before reassignment completed"
        );
      }
      throw error;
    }
  }

  @Get("board")
  @Roles(Role.ADMIN, Role.STORE_OWNER)
  board(@Req() req: any) {
    return this.dispatch.getBoard(req.user);
  }

  @Get("rider/workspace")
  @Roles(Role.RIDER)
  riderWorkspace(@Req() req: any, @Query("historyFrom") historyFrom?: string) {
    let since: Date | undefined;
    if (historyFrom) {
      since = new Date(historyFrom);
      if (!Number.isFinite(since.getTime())) {
        throw new BadRequestException("historyFrom must be a valid ISO date");
      }
      // Mobile sends the start of its local calendar day. Allow one timezone
      // day of tolerance so a 60-day local-midnight request is not rejected by
      // a rolling UTC timestamp comparison.
      const earliestAllowed = new Date(Date.now() - 61 * 24 * 60 * 60 * 1000);
      if (since < earliestAllowed) {
        throw new BadRequestException("historyFrom must be within the last 60 days");
      }
    }
    return this.dispatch.getRiderWorkspace(req.user.id, since);
  }

  @Post("jobs/:deliveryJobId/offers")
  @Roles(Role.ADMIN, Role.STORE_OWNER)
  offer(
    @Param("deliveryJobId") deliveryJobId: string,
    @Body() body: unknown,
    @Req() req: any
  ) {
    const dto = this.parse<{ riderUserId: string; expiresInSeconds?: number }>(
      OfferDispatchAssignmentSchema,
      body
    );
    return this.dispatch.offerAssignment(
      deliveryJobId,
      dto.riderUserId,
      req.user,
      dto.expiresInSeconds
    );
  }

  @Patch("assignments/:assignmentId/accept")
  @Roles(Role.RIDER)
  acceptOffer(@Param("assignmentId") assignmentId: string, @Req() req: any) {
    return this.dispatch.acceptOffer(assignmentId, req.user.id);
  }

  @Patch("assignments/:assignmentId/reject")
  @Roles(Role.RIDER)
  rejectOffer(
    @Param("assignmentId") assignmentId: string,
    @Body() body: unknown,
    @Req() req: any
  ) {
    const dto = this.parse<{ reason?: string }>(
      RejectDispatchAssignmentSchema,
      body || {}
    );
    return this.dispatch.rejectOffer(assignmentId, req.user.id, dto.reason);
  }

  @Patch("jobs/:deliveryJobId/en-route-to-store")
  @Roles(Role.RIDER)
  enRouteToStore(@Param("deliveryJobId") id: string, @Req() req: any) {
    return this.dispatch.transitionJob(
      id,
      DeliveryJobStatus.RIDER_EN_ROUTE_TO_STORE,
      req.user
    );
  }

  @Patch("jobs/:deliveryJobId/arrived-at-store")
  @Roles(Role.RIDER)
  arrivedAtStore(@Param("deliveryJobId") id: string, @Req() req: any) {
    return this.dispatch.transitionJob(
      id,
      DeliveryJobStatus.RIDER_AT_STORE,
      req.user
    );
  }

  @Patch("jobs/:deliveryJobId/pickup-verified")
  @Roles(Role.STORE_OWNER)
  pickupVerified(
    @Param("deliveryJobId") id: string,
    @Body() body: ConfirmStoreHandoffDto,
    @Req() req: any
  ) {
    return this.operations.confirmStorePickup(id, req.user, body);
  }

  @Patch("jobs/:deliveryJobId/out-for-delivery")
  @Roles(Role.RIDER)
  outForDelivery(@Param("deliveryJobId") id: string, @Req() req: any) {
    return this.dispatch.transitionJob(
      id,
      DeliveryJobStatus.OUT_FOR_DELIVERY,
      req.user
    );
  }

  @Patch("jobs/:deliveryJobId/arrived-at-customer")
  @Roles(Role.RIDER)
  arrivedAtCustomer(@Param("deliveryJobId") id: string, @Req() req: any) {
    return this.dispatch.transitionJob(
      id,
      DeliveryJobStatus.RIDER_AT_CUSTOMER,
      req.user
    );
  }

  @Patch("jobs/:deliveryJobId/delivered")
  @Roles(Role.RIDER)
  delivered(
    @Param("deliveryJobId") id: string,
    @Body() body: unknown,
    @Req() req: any,
    @Headers("idempotency-key") idempotencyKey?: string
  ) {
    const proof = this.parse<any>(DeliveryProofSchema, body || {});
    return this.operations.completeDelivery(
      id,
      req.user,
      {
        otpCode: proof.code,
        proofType: proof.proofType,
        note: proof.note,
        riderConfirmed: proof.riderConfirmed,
        latitude: proof.latitude,
        longitude: proof.longitude,
        accuracyMetres: proof.accuracyMetres,
      },
      idempotencyKey
    );
  }

  // Order-based compatibility routes. New clients should use job/assignment IDs.
  @Post(":orderId/assign")
  @Roles(Role.ADMIN, Role.STORE_OWNER)
  assign(
    @Param("orderId") orderId: string,
    @Body() body: unknown,
    @Req() req: any
  ) {
    const dto = this.parse<{ riderUserId: string }>(
      OfferDispatchAssignmentSchema,
      body
    );
    return this.dispatch.assignPackedOrder(orderId, dto.riderUserId, req.user);
  }

  @Post(":orderId/reassign")
  @Roles(Role.ADMIN)
  reassign(
    @Param("orderId") orderId: string,
    @Body() body: unknown,
    @Req() req: any
  ) {
    const dto = this.parse<{ riderUserId: string }>(
      OfferDispatchAssignmentSchema,
      body
    );
    return this.reassignAtomically(orderId, dto.riderUserId, req.user);
  }

  @Patch(":orderId/rider/accept")
  @Roles(Role.RIDER)
  accept(@Param("orderId") orderId: string, @Req() req: any) {
    return this.dispatch.acceptAssignment(orderId, req.user.id);
  }

  @Patch(":orderId/rider/reject")
  @Roles(Role.RIDER)
  reject(
    @Param("orderId") orderId: string,
    @Body() body: unknown,
    @Req() req: any
  ) {
    const dto = this.parse<{ reason?: string }>(
      RejectDispatchAssignmentSchema,
      body || {}
    );
    return this.dispatch.rejectAssignment(orderId, req.user.id, dto.reason);
  }

  @Patch(":orderId/rider/pickup")
  @Roles(Role.RIDER)
  pickup(@Param("orderId") orderId: string, @Req() req: any) {
    void orderId;
    void req;
    throw new GoneException(
      "Legacy Rider pickup is disabled. Use pickup PIN, QR, or owning-store handoff proof."
    );
  }

  @Patch(":orderId/rider/deliver")
  @Roles(Role.RIDER)
  deliver(
    @Param("orderId") orderId: string,
    @Body() body: unknown,
    @Req() req: any
  ) {
    const proof = this.parse<any>(DeliveryProofSchema, body || {});
    return this.dispatch.markDelivered(orderId, req.user.id, proof);
  }
}
