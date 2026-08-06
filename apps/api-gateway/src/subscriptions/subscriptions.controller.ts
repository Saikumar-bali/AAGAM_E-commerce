import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  CustomerSubscriptionStatus,
  Role,
  SubscriptionPlanStatus,
} from '@aagam/database';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CashDepositBatchService } from './cash-deposit-batch.service';
import { CustomerSubscriptionService } from './customer-subscription.service';
import { DeliveryRunOperationsService } from './delivery-run-operations.service';
import { DeliveryRunPlanningService } from './delivery-run-planning.service';
import { SubscriptionAdminReportingService } from './subscription-admin-reporting.service';
import { SubscriptionPlanService } from './subscription-plan.service';
import { SubscriptionSchedulerService } from './subscription-scheduler.service';
import {
  AdminSubscriptionCorrectionDto,
  AssignDeliveryRunDto,
  ArriveRunStopDto,
  CancelSubscriptionDto,
  CompleteRunStopDto,
  ConfirmRunPackingDto,
  ConfirmRunPickupReceiptDto,
  ConfirmRunStopReturnDto,
  CreateCashDepositBatchDto,
  CreateCustomerSubscriptionDto,
  FailRunStopDto,
  PauseSubscriptionDto,
  QuoteSubscriptionDto,
  ReorderRunStopDto,
  ReportSubscriptionIssueDto,
  ResolveCashVarianceDto,
  ResolveSubscriptionIssueDto,
  ResumeSubscriptionDto,
  RunVersionDto,
  SkipSubscriptionDeliveryDto,
  SubmitCashDepositBatchDto,
  UpdateSubscriptionPlanStatusDto,
  UpdateSubscriptionPreferencesDto,
  UpsertSubscriptionPlanDto,
  VerifyCashDepositBatchDto,
} from './subscriptions.dto';

type AuthenticatedRequest = { user: { id: string; role: Role } };

@Controller('subscriptions/plans')
export class SubscriptionPlanPublicController {
  constructor(
    private readonly plans: SubscriptionPlanService,
    private readonly customers: CustomerSubscriptionService,
  ) {}

  @Get()
  list() {
    return this.plans.listActive();
  }

  @Get(':idOrCode')
  details(@Param('idOrCode') idOrCode: string) {
    return this.plans.getPublic(idOrCode);
  }

  @Post(':planId/quote')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER)
  quote(@Param('planId') planId: string, @Body() body: QuoteSubscriptionDto, @Req() req: AuthenticatedRequest) {
    return this.customers.quote(req.user.id, planId, body);
  }
}

@Controller('customer/subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER)
export class CustomerSubscriptionsController {
  constructor(private readonly subscriptions: CustomerSubscriptionService) {}

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() body: CreateCustomerSubscriptionDto, @Headers('idempotency-key') key?: string) {
    return this.subscriptions.create(req.user.id, body, key);
  }

  @Get()
  mine(@Req() req: AuthenticatedRequest) {
    return this.subscriptions.listMine(req.user.id);
  }

  @Get(':id')
  one(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.subscriptions.getMine(req.user.id, id);
  }

  @Get(':id/deliveries')
  deliveries(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.subscriptions.calendarHistory(req.user.id, id);
  }

  @Post(':id/deliveries/:deliveryId/skip')
  skip(
    @Param('id') id: string,
    @Param('deliveryId') deliveryId: string,
    @Body() body: SkipSubscriptionDeliveryDto,
    @Req() req: AuthenticatedRequest,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.subscriptions.skip(req.user.id, id, deliveryId, body, key);
  }

  @Post(':id/pause')
  pause(@Param('id') id: string, @Body() body: PauseSubscriptionDto, @Req() req: AuthenticatedRequest, @Headers('idempotency-key') key?: string) {
    return this.subscriptions.pause(req.user.id, id, body, key);
  }

  @Post(':id/resume')
  resume(@Param('id') id: string, @Body() body: ResumeSubscriptionDto, @Req() req: AuthenticatedRequest, @Headers('idempotency-key') key?: string) {
    return this.subscriptions.resume(req.user.id, id, body, key);
  }

  @Patch(':id/preferences')
  preferences(
    @Param('id') id: string,
    @Body() body: UpdateSubscriptionPreferencesDto,
    @Req() req: AuthenticatedRequest,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.subscriptions.updatePreferences(req.user.id, id, body, key);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Body() body: CancelSubscriptionDto, @Req() req: AuthenticatedRequest, @Headers('idempotency-key') key?: string) {
    return this.subscriptions.cancel(req.user.id, id, body, key);
  }

  @Get(':id/tracking')
  tracking(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.subscriptions.currentTracking(req.user.id, id);
  }

  @Post(':id/deliveries/:deliveryId/issues')
  issue(
    @Param('id') id: string,
    @Param('deliveryId') deliveryId: string,
    @Body() body: ReportSubscriptionIssueDto,
    @Req() req: AuthenticatedRequest,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.subscriptions.reportIssue(req.user.id, id, deliveryId, body, key);
  }
}

@Controller('rider/delivery-runs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.RIDER)
export class RiderDeliveryRunsController {
  constructor(
    private readonly runs: DeliveryRunOperationsService,
    private readonly cash: CashDepositBatchService,
  ) {}

  @Get('today')
  today(@Req() req: AuthenticatedRequest, @Query('date') date?: string) {
    return this.runs.today(req.user, date);
  }

  @Get('cash-batches')
  batches(@Req() req: AuthenticatedRequest) {
    return this.cash.riderBatches(req.user);
  }

  @Get(':runId')
  details(@Param('runId') runId: string, @Req() req: AuthenticatedRequest) {
    return this.runs.details(runId, req.user);
  }

  @Post(':runId/pickup')
  pickup(
    @Param('runId') runId: string,
    @Body() body: ConfirmRunPickupReceiptDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.runs.confirmPickupReceipt(runId, body, req.user);
  }

  @Post(':runId/start')
  start(@Param('runId') runId: string, @Body() body: RunVersionDto, @Req() req: AuthenticatedRequest) {
    return this.runs.start(runId, body, req.user);
  }

  @Post(':runId/stops/:stopId/arrive')
  arrive(@Param('runId') runId: string, @Param('stopId') stopId: string, @Body() body: ArriveRunStopDto, @Req() req: AuthenticatedRequest) {
    return this.runs.arrive(runId, stopId, body, req.user);
  }

  @Post(':runId/stops/:stopId/otp')
  otp(
    @Param('runId') runId: string,
    @Param('stopId') stopId: string,
    @Req() req: AuthenticatedRequest,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.runs.issueOtp(runId, stopId, req.user, key);
  }

  @Post(':runId/stops/:stopId/complete')
  complete(
    @Param('runId') runId: string,
    @Param('stopId') stopId: string,
    @Body() body: CompleteRunStopDto,
    @Req() req: AuthenticatedRequest,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.runs.complete(runId, stopId, body, req.user, key);
  }

  @Post(':runId/stops/:stopId/fail')
  fail(
    @Param('runId') runId: string,
    @Param('stopId') stopId: string,
    @Body() body: FailRunStopDto,
    @Req() req: AuthenticatedRequest,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.runs.fail(runId, stopId, body, req.user, key);
  }

  @Post(':runId/stops/:stopId/reorder')
  reorder(@Param('runId') runId: string, @Param('stopId') stopId: string, @Body() body: ReorderRunStopDto, @Req() req: AuthenticatedRequest) {
    return this.runs.reorder(runId, stopId, body, req.user);
  }

  @Post(':runId/finish')
  finish(@Param('runId') runId: string, @Body() body: RunVersionDto, @Req() req: AuthenticatedRequest) {
    return this.runs.finish(runId, body, req.user);
  }

  @Get(':runId/cash-accountability')
  accountability(@Param('runId') runId: string, @Req() req: AuthenticatedRequest) {
    return this.runs.cashAccountability(runId, req.user);
  }

  @Post(':runId/cash-batches')
  createBatch(
    @Param('runId') runId: string,
    @Body() body: CreateCashDepositBatchDto,
    @Req() req: AuthenticatedRequest,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.cash.create(runId, body, req.user, key);
  }

  @Post('cash-batches/:batchId/submit')
  submitBatch(
    @Param('batchId') batchId: string,
    @Body() body: SubmitCashDepositBatchDto,
    @Req() req: AuthenticatedRequest,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.cash.submit(batchId, body, req.user, key);
  }
}

@Controller('store/subscription-operations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STORE_OWNER, Role.ADMIN)
export class StoreSubscriptionOperationsController {
  constructor(
    private readonly planning: DeliveryRunPlanningService,
    private readonly cash: CashDepositBatchService,
  ) {}

  @Get('demand')
  demand(@Req() req: AuthenticatedRequest, @Query('days') days?: string) {
    return this.planning.storeDemand(req.user, Number(days || 14));
  }

  @Get('runs')
  runs(@Req() req: AuthenticatedRequest, @Query('serviceDate') serviceDate?: string) {
    return this.planning.storeRuns(req.user, serviceDate);
  }

  @Get('exceptions')
  exceptions(@Req() req: AuthenticatedRequest) {
    return this.planning.exceptions(req.user);
  }

  @Get('cash-batches')
  batches(@Req() req: AuthenticatedRequest) {
    return this.cash.storeBatches(req.user);
  }

  @Post('runs/:runId/packing')
  packing(@Param('runId') runId: string, @Body() body: ConfirmRunPackingDto, @Req() req: AuthenticatedRequest) {
    return this.planning.confirmPacking(runId, body, req.user);
  }

  @Post('runs/:runId/pickup')
  pickup(@Param('runId') runId: string, @Body() body: RunVersionDto, @Req() req: AuthenticatedRequest) {
    return this.planning.confirmStoreHandoff(runId, body, req.user);
  }

  @Post('runs/:runId/stops/:stopId/return')
  returned(
    @Param('runId') runId: string,
    @Param('stopId') stopId: string,
    @Body() body: ConfirmRunStopReturnDto,
    @Req() req: AuthenticatedRequest,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.planning.confirmReturnedStop(runId, stopId, body, req.user, key);
  }

  @Post('cash-batches/:batchId/verify')
  verify(
    @Param('batchId') batchId: string,
    @Body() body: VerifyCashDepositBatchDto,
    @Req() req: AuthenticatedRequest,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.cash.verify(batchId, body, req.user, key);
  }
}

@Controller('admin/subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminSubscriptionsController {
  constructor(
    private readonly plans: SubscriptionPlanService,
    private readonly reporting: SubscriptionAdminReportingService,
    private readonly planning: DeliveryRunPlanningService,
    private readonly cash: CashDepositBatchService,
    private readonly scheduler: SubscriptionSchedulerService,
  ) {}

  @Get('plans')
  plansList(@Query('status') status?: SubscriptionPlanStatus) {
    return this.plans.listAdmin(status);
  }

  @Get('plans/:id')
  plan(@Param('id') id: string) {
    return this.plans.getAdmin(id);
  }

  @Post('plans')
  createPlan(@Body() body: UpsertSubscriptionPlanDto, @Req() req: AuthenticatedRequest) {
    return this.plans.create(body, req.user.id);
  }

  @Patch('plans/:id')
  updatePlan(@Param('id') id: string, @Body() body: UpsertSubscriptionPlanDto, @Req() req: AuthenticatedRequest) {
    return this.plans.update(id, body, req.user.id);
  }

  @Post('plans/:id/publish')
  publish(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.plans.publish(id, req.user.id);
  }

  @Patch('plans/:id/status')
  status(@Param('id') id: string, @Body() body: UpdateSubscriptionPlanStatusDto, @Req() req: AuthenticatedRequest) {
    return this.plans.setStatus(id, body.status, req.user.id);
  }

  @Delete('plans/:id')
  archive(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.plans.setStatus(id, SubscriptionPlanStatus.ARCHIVED, req.user.id);
  }

  @Get('subscribers')
  subscribers(@Query('status') status?: CustomerSubscriptionStatus, @Query('planId') planId?: string) {
    return this.reporting.subscribers(status, planId);
  }

  @Get('subscribers/:id')
  subscriber(@Param('id') id: string) {
    return this.reporting.subscription(id);
  }

  @Get('delivery-calendar')
  calendar(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reporting.deliveryCalendar(from, to);
  }

  @Get('runs')
  routes(@Query('serviceDate') serviceDate?: string) {
    return this.reporting.routes(serviceDate);
  }

  @Post('runs/:runId/assign')
  assign(@Param('runId') runId: string, @Body() body: AssignDeliveryRunDto, @Req() req: AuthenticatedRequest) {
    return this.planning.assign(runId, body, req.user);
  }

  @Get('cash-control')
  cashControl() {
    return this.reporting.cashControl();
  }

  @Get('exceptions')
  exceptions() {
    return this.reporting.exceptions();
  }

  @Get('analytics')
  analytics() {
    return this.reporting.analytics();
  }

  @Post('scheduler/run')
  runScheduler() {
    return this.scheduler.tick();
  }

  @Post('subscribers/:id/corrections')
  correct(
    @Param('id') id: string,
    @Body() body: AdminSubscriptionCorrectionDto,
    @Req() req: AuthenticatedRequest,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.reporting.correctSubscription(id, body, req.user.id, key);
  }

  @Post('issues/:issueId/resolve')
  resolveIssue(@Param('issueId') issueId: string, @Body() body: ResolveSubscriptionIssueDto, @Req() req: AuthenticatedRequest) {
    return this.reporting.resolveIssue(issueId, body, req.user.id);
  }

  @Post('cash-batches/:batchId/resolve-variance')
  resolveVariance(
    @Param('batchId') batchId: string,
    @Body() body: ResolveCashVarianceDto,
    @Req() req: AuthenticatedRequest,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.cash.resolveVariance(batchId, body, req.user, key);
  }
}
