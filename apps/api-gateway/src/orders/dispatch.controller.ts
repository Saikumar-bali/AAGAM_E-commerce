import {
  BadRequestException,
  Body,
  Controller,
  Get,
  GoneException,
  Headers,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Role } from "@aagam/database";
import {
  DeliveryJobStatus,
  DeliveryProofSchema,
  OfferDispatchAssignmentSchema,
  RejectDispatchAssignmentSchema,
} from "@aagam/types";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { DeliveryOperationsService } from "./delivery-operations.service";
import { ConfirmStoreHandoffDto } from "./delivery-operations.dto";
import { DispatchService } from "./dispatch.service";

@Controller("orders/dispatch")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DispatchController {
  constructor(
    private readonly dispatch: DispatchService,
    private readonly operations: DeliveryOperationsService
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

  @Get("board")
  @Roles(Role.ADMIN, Role.STORE_OWNER)
  board(@Req() req: any) {
    return this.dispatch.getBoard(req.user);
  }

  @Get("rider/workspace")
  @Roles(Role.RIDER)
  riderWorkspace(@Req() req: any) {
    return this.dispatch.getRiderWorkspace(req.user.id);
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
