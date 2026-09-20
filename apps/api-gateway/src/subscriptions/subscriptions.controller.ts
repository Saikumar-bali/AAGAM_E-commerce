import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import {
  CustomerSubscriptionStatus,
  prisma,
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
import { TrustedDropService } from './trusted-drop.service';
import { OfflineCustomerService } from './offline-customer.service';
import { StoreSelfDeliveryService } from './store-self-delivery.service';
import { StoreMilkGridService } from './store-milk-grid.service';
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
  CreateCustomManualSubscriptionDto,
  FailRunStopDto,
  IssueTrustedDropChallengeDto,
  PauseSubscriptionDto,
  QuoteSubscriptionDto,
  ReorderRunStopDto,
  ReportSubscriptionIssueDto,
  ResolveCashVarianceDto,
  ResolveSubscriptionIssueDto,
  ResumeSubscriptionDto,
  RunVersionDto,
  SkipSubscriptionDeliveryDto,
  StoreDeliveryCompleteDto,
  StoreDeliveryFailureDto,
  SubmitCashDepositBatchDto,
  UpdateSubscriptionPlanStatusDto,
  UpdateSubscriptionPreferencesDto,
  TrustedDropEvidenceUploadDto,
  UpsertSubscriptionPlanDto,
  VerifyCashDepositBatchDto,
  CreateManualOfflineCustomerDto,
  CreateAdminManualSubscriptionDto,
  UpdateAdminManualSubscriptionDto,
  RenewSubscriptionDto,
  RecordCustomerPaymentDto,
  DispatchToRiderDto,
  RiderExtraMilkDto,
  RiderRecordPaymentDto,
  RiderToggleSlotDto,
  SetDefaultRiderDto,
  AutoDispatchDefaultRidersDto,
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
  constructor(
    private readonly subscriptions: CustomerSubscriptionService,
    private readonly trustedDrop: TrustedDropService,
  ) {}

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

  @Post(':id/trusted-drop/qr')
  trustedDropQr(
    @Param('id') id: string,
    @Body() body: IssueTrustedDropChallengeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.trustedDrop.issue(req.user.id, id, body.subscriptionDeliveryId);
  }

  @Post(':id/trusted-drop/rotate')
  rotateTrustedDrop(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.trustedDrop.rotate(req.user.id, id);
  }

  @Post(':id/trusted-drop/revoke')
  revokeTrustedDrop(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.trustedDrop.revoke(req.user.id, id);
  }

  @Get(':id/tracking')
  tracking(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.subscriptions.currentTracking(req.user.id, id);
  }

  @Get(':id/expiry')
  expiry(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.subscriptions.getMine(req.user.id, id).then((sub) => {
      const terminal = sub.status === CustomerSubscriptionStatus.CANCELLED || sub.status === CustomerSubscriptionStatus.COMPLETED;
      const now = new Date();
      const endDate = new Date(sub.endDate);
      const daysUntilExpiry = Math.ceil((endDate.getTime() - now.getTime()) / 86_400_000);
      return {
        subscriptionId: sub.id,
        planName: sub.plan?.name,
        endDate: sub.endDate,
        daysUntilExpiry,
        expiringSoon: !terminal && daysUntilExpiry >= 1 && daysUntilExpiry <= 3,
        status: sub.status,
      };
    });
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
    private readonly trustedDrop: TrustedDropService,
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

  @Post(':runId/stops/:stopId/trusted-drop-evidence')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 6 * 1024 * 1024, files: 1 } }))
  trustedDropEvidence(
    @Param('runId') runId: string,
    @Param('stopId') stopId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: TrustedDropEvidenceUploadDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.trustedDrop.uploadEvidence({ file, runId, stopId, token: body.trustedDropToken, capturedAt: body.capturedAt }, req.user);
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

  @Post(':runId/stops/:stopId/extra-milk')
  extraMilk(
    @Param('runId') runId: string,
    @Param('stopId') stopId: string,
    @Body() body: RiderExtraMilkDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.runs.extraMilk(runId, stopId, body, req.user);
  }

  @Post(':runId/stops/:stopId/toggle-slot')
  toggleSlot(
    @Param('runId') runId: string,
    @Param('stopId') stopId: string,
    @Body() body: RiderToggleSlotDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.runs.toggleSlot(runId, stopId, body, req.user);
  }

  @Post(':runId/stops/:stopId/record-payment')
  recordPayment(
    @Param('runId') runId: string,
    @Param('stopId') stopId: string,
    @Body() body: RiderRecordPaymentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.runs.recordPayment(runId, stopId, body, req.user);
  }

  @Post(':runId/stops/:stopId/skip')
  skip(
    @Param('runId') runId: string,
    @Param('stopId') stopId: string,
    @Body() body: { reason?: string; note?: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.runs.skipStop(runId, stopId, body, req.user);
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

@Controller('store/subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STORE_OWNER, Role.ADMIN)
export class StoreSubscriptionsController {
  constructor(
    private readonly planService: SubscriptionPlanService,
    private readonly reporting: SubscriptionAdminReportingService,
    private readonly offlineCustomers: OfflineCustomerService,
    private readonly milkGrid: StoreMilkGridService,
  ) {}

  @Get('grid')
  grid(
    @Req() req: AuthenticatedRequest,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.milkGrid.getGrid(
      req.user,
      year ? parseInt(year, 10) : undefined,
      month !== undefined && month !== '' ? parseInt(month, 10) : undefined,
    );
  }

  @Get('available-riders')
  availableRiders(@Req() req: AuthenticatedRequest) {
    return this.milkGrid.getAvailableRiders(req.user);
  }

  @Post('dispatch-to-rider')
  dispatchToRider(
    @Body() body: DispatchToRiderDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.milkGrid.dispatchToRider(req.user, body);
  }

  @Post(':subscriptionId/default-rider')
  setDefaultRider(
    @Param('subscriptionId') subscriptionId: string,
    @Body() body: SetDefaultRiderDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.milkGrid.setDefaultRider(req.user, subscriptionId, body.riderProfileId);
  }

  @Post('auto-dispatch-default-riders')
  autoDispatchDefaultRiders(
    @Body() body: AutoDispatchDefaultRidersDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.milkGrid.autoDispatchDefaultRiders(req.user, body);
  }


  @Post('deliveries/:id/quick-action')
  quickAction(
    @Param('id') id: string,
    @Body()
    body: {
      type: 'TOGGLE_DELIVERED' | 'SKIP' | 'EXTRA_MILK' | 'TOGGLE_SLOT' | 'RECORD_PAYMENT' | 'ATTACH_EVENING_MILK';
      extraQuantity?: string;
      extraPaise?: number;
      paymentMode?: 'CASH' | 'PHONE_PE';
      amountPaise?: number;
      note?: string;
      consecutiveDays?: number;
      targetSlot?: 'AM' | 'PM';
    },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.milkGrid.executeQuickAction(req.user, id, body);
  }

  @Get('dispatch-summary')
  dispatchSummary(
    @Req() req: AuthenticatedRequest,
    @Query('date') date?: string,
  ) {
    return this.milkGrid.getDispatchSummary(req.user, date);
  }

  @Get('customer/:id/statement')
  customerStatement(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.milkGrid.getCustomerStatement(req.user, id);
  }

  @Get('grid/export-csv')
  async exportCsv(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const csv = await this.milkGrid.exportCsv(
      req.user,
      year ? parseInt(year, 10) : undefined,
      month !== undefined && month !== '' ? parseInt(month, 10) : undefined,
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="aagam-milk-grid-${year || '2026'}-${month !== undefined ? month : 'month'}.csv"`,
    );
    res.send(csv);
  }

  @Get('subscribers')
  subscribers(@Req() req: AuthenticatedRequest) {
    return this.reporting.storeSubscribers(req.user);
  }

  @Get('subscribers/:subscriptionId/history')
  subscriberHistory(@Param('subscriptionId') subscriptionId: string, @Req() req: AuthenticatedRequest) {
    return this.offlineCustomers.getDeliveryTracker(subscriptionId, req.user);
  }

  @Get('plans')
  plans(@Req() req: AuthenticatedRequest) {
    // Admins see all plans; store owners only see plans assigned to their stores.
    if (req.user.role === Role.ADMIN) return this.planService.listAdmin();
    return this.planService.listForStore(req.user.id);
  }

  @Get('calendar')
  calendar(@Req() req: AuthenticatedRequest, @Query('from') from?: string, @Query('to') to?: string) {
    return this.reporting.storeDeliveryCalendar(req.user, from, to);
  }

  @Get('analytics')
  analytics(@Req() req: AuthenticatedRequest) {
    return this.reporting.storeAnalytics(req.user);
  }

  @Post('subscribers/:id/renew')
  renewSubscription(
    @Param('id') id: string,
    @Body() body: RenewSubscriptionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reporting.renewSubscription(id, body, req.user.id, req.user.role);
  }

  @Post('subscribers/:id/record-payment')
  recordPayment(
    @Param('id') id: string,
    @Body() body: RecordCustomerPaymentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reporting.recordCustomerPayment(id, body, req.user.id, req.user.role);
  }

  @Patch('subscribers/:id/manual-edit')
  async updateManualSubscription(
    @Param('id') id: string,
    @Body() body: UpdateAdminManualSubscriptionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    if (req.user.role !== Role.ADMIN) {
      const sub = await prisma.customerSubscription.findUnique({
        where: { id },
        include: { homeStore: { select: { ownerId: true } } },
      });
      if (!sub || sub.homeStore?.ownerId !== req.user.id) {
        throw new ForbiddenException('You do not have access to this subscription');
      }
    }
    return this.reporting.updateManualSubscription(id, body, req.user.id);
  }

  @Post('manual-customer')
  async createOfflineCustomer(@Body() body: CreateManualOfflineCustomerDto, @Req() req: AuthenticatedRequest) {
    // Pin ownership to a store the caller controls, so the created customer is
    // manageable (and only manageable) from that store's portal.
    if (req.user.role !== Role.ADMIN) {
      const ownedStores = await prisma.store.findMany({
        where: { ownerId: req.user.id },
        select: { id: true },
      });
      if (ownedStores.length === 0) {
        throw new ForbiddenException('You do not own any stores');
      }
      if (!body.storeId && ownedStores.length > 1) {
        throw new BadRequestException('storeId is required when managing multiple stores');
      }
      const ownedStore = body.storeId
        ? await prisma.store.findFirst({ where: { id: body.storeId, ownerId: req.user.id } })
        : await prisma.store.findFirst({ where: { ownerId: req.user.id } });
      if (!ownedStore) {
        throw new ForbiddenException('You do not own this store');
      }
      body.storeId = ownedStore.id;
    } else {
      if (!body.storeId) {
        throw new BadRequestException('storeId is required');
      }
      const storeExists = await prisma.store.findUnique({ where: { id: body.storeId } });
      if (!storeExists) {
        throw new NotFoundException('Store not found');
      }
    }
    return this.reporting.createOfflineCustomer(body, req.user);
  }

  @Post('manual-subscribe')
  async createManualSubscription(@Body() body: CreateAdminManualSubscriptionDto, @Req() req: AuthenticatedRequest) {
    if (req.user.role !== Role.ADMIN) {
      const store = await prisma.store.findUnique({ where: { id: body.storeId } });
      if (!store || store.ownerId !== req.user.id) {
        throw new ForbiddenException('You do not own this store');
      }
    }
    return this.reporting.createManualSubscription(body, req.user.id);
  }

  @Post('custom-subscribe')
  async createCustomManualSubscription(@Body() body: CreateCustomManualSubscriptionDto, @Req() req: AuthenticatedRequest) {
    if (req.user.role !== Role.ADMIN) {
      const store = await prisma.store.findUnique({ where: { id: body.storeId } });
      if (!store || store.ownerId !== req.user.id) {
        throw new ForbiddenException('You do not own this store');
      }
    }
    return this.reporting.createCustomManualSubscription(body, req.user.id);
  }

  @Get('offline-customers')
  async listOfflineCustomers(
    @Req() req: AuthenticatedRequest,
    @Query('search') search?: string,
    @Query('storeId') storeId?: string,
    @Query('status') status?: string,
    @Query('recycleBin') recycleBin?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    let effectiveStoreId = storeId;
    let storeIds: string[] | undefined = undefined;

    if (req.user.role !== Role.ADMIN) {
      const ownedStores = await prisma.store.findMany({
        where: { ownerId: req.user.id },
        select: { id: true },
      });
      const ownedStoreIds = ownedStores.map((s) => s.id);
      if (ownedStoreIds.length === 0) {
        return { customers: [], total: 0, recycleBinCount: 0, page: 1, pageSize: 25, totalPages: 0 };
      }
      if (storeId) {
        if (!ownedStoreIds.includes(storeId)) {
          throw new ForbiddenException('You do not own this store');
        }
        effectiveStoreId = storeId;
      } else {
        effectiveStoreId = undefined;
        storeIds = ownedStoreIds;
      }
    }

    return this.offlineCustomers.listCustomers({
      search,
      storeId: effectiveStoreId,
      storeIds,
      status,
      recycleBin: recycleBin === 'true',
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 25,
    });
  }

  @Get('offline-customers/:customerId')
  getOfflineCustomerDetail(@Param('customerId') customerId: string, @Req() req: AuthenticatedRequest) {
    return this.offlineCustomers.getCustomerDetail(customerId, req.user);
  }

  @Get('offline-customers/:customerId/delivery-tracker')
  async getOfflineCustomerTracker(
    @Param('customerId') customerId: string,
    @Req() req: AuthenticatedRequest,
    @Query('subscriptionId') subscriptionId?: string,
  ) {
    if (subscriptionId) {
      return this.offlineCustomers.getDeliveryTracker(subscriptionId, req.user);
    }
    const sub = await prisma.customerSubscription.findFirst({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!sub) throw new NotFoundException('No subscription found for this customer');
    return this.offlineCustomers.getDeliveryTracker(sub.id, req.user);
  }

  // Lifecycle mutation is store-owned: the owning store is the only actor
  // allowed to bin, restore, or purge an offline customer.
  @Delete('offline-customers/:customerId')
  @Roles(Role.STORE_OWNER)
  deleteOfflineCustomer(
    @Param('customerId') customerId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body?: { reason?: string },
  ) {
    return this.offlineCustomers.moveToRecycleBin(customerId, body?.reason, req.user);
  }

  @Post('offline-customers/:customerId/restore')
  @Roles(Role.STORE_OWNER)
  restoreOfflineCustomer(@Param('customerId') customerId: string, @Req() req: AuthenticatedRequest) {
    return this.offlineCustomers.restoreFromRecycleBin(customerId, req.user);
  }

  @Delete('offline-customers/:customerId/permanent')
  @Roles(Role.STORE_OWNER)
  permanentDeleteOfflineCustomer(@Param('customerId') customerId: string, @Req() req: AuthenticatedRequest) {
    return this.offlineCustomers.permanentDeleteCustomer(customerId, req.user);
  }

  @Delete('subscribers/customer/:customerId/permanent')
  @Roles(Role.STORE_OWNER)
  permanentDeleteSubscriberCustomer(@Param('customerId') customerId: string, @Req() req: AuthenticatedRequest) {
    return this.offlineCustomers.permanentDeleteCustomer(customerId, req.user);
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
    private readonly offlineCustomers: OfflineCustomerService,
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

  @Get('scheduler/readiness')
  schedulerReadiness() {
    return this.scheduler.readiness();
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

  @Post('deliveries/:deliveryId/reconcile')
  reconcile(
    @Param('deliveryId') deliveryId: string,
    @Req() req: AuthenticatedRequest,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.reporting.reconcileDeliveredDelivery(deliveryId, req.user.id, key);
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

  @Post('manual-customer')
  createOfflineCustomer(@Body() body: CreateManualOfflineCustomerDto) {
    return this.reporting.createOfflineCustomer(body);
  }

  @Post('manual-subscribe')
  createManualSubscription(@Body() body: CreateAdminManualSubscriptionDto, @Req() req: AuthenticatedRequest) {
    return this.reporting.createManualSubscription(body, req.user.id);
  }

  @Patch('subscribers/:id/manual-edit')
  updateManualSubscription(@Param('id') id: string, @Body() body: UpdateAdminManualSubscriptionDto, @Req() req: AuthenticatedRequest) {
    return this.reporting.updateManualSubscription(id, body, req.user.id);
  }

  @Post('subscribers/:id/renew')
  renewSubscription(
    @Param('id') id: string,
    @Body() body: RenewSubscriptionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reporting.renewSubscription(id, body, req.user.id, req.user.role);
  }

  @Post('subscribers/:id/record-payment')
  recordPayment(
    @Param('id') id: string,
    @Body() body: RecordCustomerPaymentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reporting.recordCustomerPayment(id, body, req.user.id, req.user.role);
  }

  @Post('custom-subscribe')
  createCustomManualSubscription(@Body() body: CreateCustomManualSubscriptionDto, @Req() req: AuthenticatedRequest) {
    return this.reporting.createCustomManualSubscription(body, req.user.id);
  }

  @Get('offline-customers')
  listOfflineCustomers(
    @Query('search') search?: string,
    @Query('storeId') storeId?: string,
    @Query('status') status?: string,
    @Query('recycleBin') recycleBin?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.offlineCustomers.listCustomers({
      search,
      storeId,
      status,
      recycleBin: recycleBin === 'true',
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 25,
    });
  }

  @Get('offline-customers/:customerId')
  getOfflineCustomerDetail(@Param('customerId') customerId: string, @Req() req: AuthenticatedRequest) {
    return this.offlineCustomers.getCustomerDetail(customerId, req.user);
  }

  @Get('offline-customers/:customerId/delivery-tracker')
  async getDeliveryTracker(@Param('customerId') customerId: string, @Req() req: AuthenticatedRequest, @Query('subscriptionId') subscriptionId?: string) {
    if (subscriptionId) {
      return this.offlineCustomers.getDeliveryTracker(subscriptionId, req.user);
    }
    const sub = await prisma.customerSubscription.findFirst({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!sub) throw new NotFoundException('No subscription found for this customer');
    return this.offlineCustomers.getDeliveryTracker(sub.id, req.user);
  }

  @Post('offline-customers/:customerId/reactivate')
  reactivateCustomer(@Param('customerId') customerId: string, @Body() body: { storeId: string }, @Req() req: AuthenticatedRequest) {
    return this.offlineCustomers.reactivateCustomer(customerId, body.storeId, req.user.id);
  }
}
