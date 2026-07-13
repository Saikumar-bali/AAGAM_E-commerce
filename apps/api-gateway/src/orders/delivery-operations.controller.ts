import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Role } from "@aagam/database";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import {
  CollectCodDto,
  CompleteDeliveryOperationDto,
  ConfirmStoreHandoffDto,
  IssuePickupChallengeDto,
  RecordDeliveryFailureDto,
  ResolveDeliveryFailureDto,
  ReturnInspectionDto,
  SettleCodDto,
  VerifyPickupProofDto,
} from "./delivery-operations.dto";
import { DeliveryOperationsService } from "./delivery-operations.service";

@Controller("orders/delivery-operations")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DeliveryOperationsController {
  constructor(private readonly operations: DeliveryOperationsService) {}

  @Get("queue")
  @Roles(Role.ADMIN, Role.STORE_OWNER)
  queue(@Req() req: any) {
    return this.operations.getQueue(req.user);
  }

  @Get("jobs/:deliveryJobId/summary")
  @Roles(Role.ADMIN, Role.STORE_OWNER, Role.RIDER, Role.CUSTOMER)
  summary(@Param("deliveryJobId") deliveryJobId: string, @Req() req: any) {
    return this.operations.getSummary(deliveryJobId, req.user);
  }

  @Post("jobs/:deliveryJobId/pickup/challenge")
  @Roles(Role.STORE_OWNER)
  issuePickupChallenge(
    @Param("deliveryJobId") deliveryJobId: string,
    @Body() body: IssuePickupChallengeDto,
    @Req() req: any
  ) {
    return this.operations.issuePickupChallenge(deliveryJobId, req.user, body);
  }

  @Post("jobs/:deliveryJobId/pickup/verify")
  @Roles(Role.RIDER)
  verifyPickupChallenge(
    @Param("deliveryJobId") deliveryJobId: string,
    @Body() body: VerifyPickupProofDto,
    @Req() req: any
  ) {
    return this.operations.verifyPickupChallenge(deliveryJobId, req.user, body);
  }

  @Post("jobs/:deliveryJobId/pickup/confirm")
  @Roles(Role.STORE_OWNER)
  confirmStorePickup(
    @Param("deliveryJobId") deliveryJobId: string,
    @Body() body: ConfirmStoreHandoffDto,
    @Req() req: any
  ) {
    return this.operations.confirmStorePickup(deliveryJobId, req.user, body);
  }

  @Post("jobs/:deliveryJobId/otp/issue")
  @Roles(Role.ADMIN, Role.RIDER)
  issueOtp(
    @Param("deliveryJobId") deliveryJobId: string,
    @Req() req: any,
    @Headers("idempotency-key") idempotencyKey?: string
  ) {
    return this.operations.issueOtp(deliveryJobId, req.user, idempotencyKey);
  }

  @Get("jobs/:deliveryJobId/otp/customer")
  @Roles(Role.CUSTOMER)
  customerOtp(@Param("deliveryJobId") deliveryJobId: string, @Req() req: any) {
    return this.operations.getCustomerOtp(deliveryJobId, req.user);
  }

  @Post("jobs/:deliveryJobId/failure")
  @Roles(Role.ADMIN, Role.RIDER)
  recordFailure(
    @Param("deliveryJobId") deliveryJobId: string,
    @Body() body: RecordDeliveryFailureDto,
    @Req() req: any,
    @Headers("idempotency-key") idempotencyKey?: string
  ) {
    return this.operations.recordFailure(
      deliveryJobId,
      req.user,
      body,
      idempotencyKey
    );
  }

  @Post("jobs/:deliveryJobId/failure-resolution")
  @Roles(Role.ADMIN)
  resolveFailure(
    @Param("deliveryJobId") deliveryJobId: string,
    @Body() body: ResolveDeliveryFailureDto,
    @Req() req: any,
    @Headers("idempotency-key") idempotencyKey?: string
  ) {
    return this.operations.resolveFailure(
      deliveryJobId,
      req.user,
      body,
      idempotencyKey
    );
  }

  @Post("jobs/:deliveryJobId/return/start")
  @Roles(Role.ADMIN, Role.RIDER)
  startReturn(
    @Param("deliveryJobId") deliveryJobId: string,
    @Req() req: any,
    @Headers("idempotency-key") idempotencyKey?: string
  ) {
    return this.operations.startReturn(deliveryJobId, req.user, idempotencyKey);
  }

  @Post("jobs/:deliveryJobId/return/confirm")
  @Roles(Role.ADMIN, Role.STORE_OWNER)
  confirmReturn(
    @Param("deliveryJobId") deliveryJobId: string,
    @Req() req: any,
    @Headers("idempotency-key") idempotencyKey?: string
  ) {
    return this.operations.confirmReturn(
      deliveryJobId,
      req.user,
      idempotencyKey
    );
  }

  @Post("jobs/:deliveryJobId/return/inspection")
  @Roles(Role.ADMIN, Role.STORE_OWNER)
  inspectReturn(
    @Param("deliveryJobId") deliveryJobId: string,
    @Body() body: ReturnInspectionDto,
    @Req() req: any,
    @Headers("idempotency-key") idempotencyKey?: string
  ) {
    return this.operations.inspectReturn(
      deliveryJobId,
      req.user,
      body,
      idempotencyKey
    );
  }

  @Post("jobs/:deliveryJobId/cod/collect")
  @Roles(Role.ADMIN, Role.RIDER)
  collectCod(
    @Param("deliveryJobId") deliveryJobId: string,
    @Body() body: CollectCodDto,
    @Req() req: any,
    @Headers("idempotency-key") idempotencyKey?: string
  ) {
    return this.operations.collectCod(
      deliveryJobId,
      req.user,
      body,
      idempotencyKey
    );
  }

  @Post("jobs/:deliveryJobId/cod/settle")
  @Roles(Role.ADMIN, Role.STORE_OWNER)
  settleCod(
    @Param("deliveryJobId") deliveryJobId: string,
    @Body() body: SettleCodDto,
    @Req() req: any,
    @Headers("idempotency-key") idempotencyKey?: string
  ) {
    return this.operations.settleCod(
      deliveryJobId,
      req.user,
      body,
      idempotencyKey
    );
  }

  @Post("jobs/:deliveryJobId/complete")
  @Roles(Role.ADMIN, Role.RIDER)
  complete(
    @Param("deliveryJobId") deliveryJobId: string,
    @Body() body: CompleteDeliveryOperationDto,
    @Req() req: any,
    @Headers("idempotency-key") idempotencyKey?: string
  ) {
    return this.operations.completeDelivery(
      deliveryJobId,
      req.user,
      body,
      idempotencyKey
    );
  }
}
