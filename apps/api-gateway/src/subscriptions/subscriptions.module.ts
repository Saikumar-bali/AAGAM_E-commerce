import { Module, forwardRef } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { OrderModule } from '../orders/order.module';
import { UploadModule } from '../upload/upload.module';
import { CashDepositBatchService } from './cash-deposit-batch.service';
import { CustomerSubscriptionService } from './customer-subscription.service';
import { DeliveryRunOperationsService } from './delivery-run-operations.service';
import { DeliveryRunPlanningService } from './delivery-run-planning.service';
import { OfflineCustomerService } from './offline-customer.service';
import { StoreMilkGridService } from './store-milk-grid.service';
import { StoreMilkGridGridService } from './store-milk-grid.grid.service';
import { StoreMilkGridQuickActionService } from './store-milk-grid.quick-action.service';
import { StoreMilkGridDispatchService } from './store-milk-grid.dispatch.service';
import { StoreMilkGridStatementService } from './store-milk-grid.statement.service';
import { AdminRegionalRoutingController, RegionalRoutingEventsController } from './regional-routing.controller';
import { RegionalDeliveryZoneService } from './regional-delivery-zone.service';
import { RegionalRouteNotificationService } from './regional-route-notification.service';
import { RegionalRouteOperationsService } from './regional-route-operations.service';
import { RegionalRoutePlanningService } from './regional-route-planning.service';
import {
  AdminSubscriptionPreparationController,
  StoreSubscriptionPreparationController,
} from './subscription-preparation.controller';
import { SubscriptionPreparationService } from './subscription-preparation.service';
import { SubscriptionExpirationService } from './subscription-expiration.service';
import { SubscriptionRiderCapacityNotificationService } from './subscription-rider-capacity-notification.service';
import { SubscriptionAdminReportingService } from './subscription-admin-reporting.service';
import { SubscriptionAdminReportingPaymentsService } from './subscription-admin-reporting.payments.service';
import { SubscriptionAdminReportingReadService } from './subscription-admin-reporting.read.service';
import { SubscriptionAdminReportingCorrectionService } from './subscription-admin-reporting.correction.service';
import { SubscriptionAdminReportingIssueService } from './subscription-admin-reporting.issue.service';
import { SubscriptionAdminReportingOfflineCustomerService } from './subscription-admin-reporting.offline-customer.service';
import { SubscriptionAdminReportingManualSubscriptionService } from './subscription-admin-reporting.manual-subscription.service';
import { SubscriptionAdminReportingRenewalService } from './subscription-admin-reporting.renewal.service';
import { SubscriptionCalendarService } from './subscription-calendar.service';
import { SubscriptionCashFundingService } from './subscription-cash-funding.service';
import { SubscriptionOrderGenerator } from './subscription-order-generator.service';
import { SubscriptionPlanService } from './subscription-plan.service';
import { SubscriptionSchedulerService } from './subscription-scheduler.service';
import { SubscriptionServiceabilityService } from './subscription-serviceability.service';
import { StoreSelfDeliveryController } from './store-self-delivery.controller';
import { StoreSelfDeliveryService } from './store-self-delivery.service';
import { TrustedDropAddressPolicyInterceptor } from './trusted-drop-address-policy.interceptor';
import { TrustedDropService } from './trusted-drop.service';
import {
  AdminSubscriptionsController,
  CustomerSubscriptionsController,
  RiderDeliveryRunsController,
  StoreSubscriptionOperationsController,
  StoreSubscriptionsController,
  SubscriptionPlanPublicController,
} from './subscriptions.controller';

@Module({
  imports: [forwardRef(() => OrderModule), UploadModule],
  controllers: [
    SubscriptionPlanPublicController,
    CustomerSubscriptionsController,
    RiderDeliveryRunsController,
    StoreSubscriptionOperationsController,
    StoreSubscriptionsController,
    StoreSubscriptionPreparationController,
    AdminSubscriptionsController,
    AdminSubscriptionPreparationController,
    AdminRegionalRoutingController,
    RegionalRoutingEventsController,
    StoreSelfDeliveryController,
  ],
  providers: [
    SubscriptionCalendarService,
    SubscriptionPlanService,
    CustomerSubscriptionService,
    SubscriptionOrderGenerator,
    DeliveryRunPlanningService,
    DeliveryRunOperationsService,
    RegionalDeliveryZoneService,
    RegionalRoutePlanningService,
    RegionalRouteOperationsService,
    RegionalRouteNotificationService,
    SubscriptionPreparationService,
    SubscriptionExpirationService,
    SubscriptionRiderCapacityNotificationService,
    SubscriptionServiceabilityService,
    TrustedDropService,
    TrustedDropAddressPolicyInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useExisting: TrustedDropAddressPolicyInterceptor,
    },
    SubscriptionCashFundingService,
    CashDepositBatchService,
    SubscriptionAdminReportingService,
    SubscriptionAdminReportingPaymentsService,
    SubscriptionAdminReportingReadService,
    SubscriptionAdminReportingCorrectionService,
    SubscriptionAdminReportingIssueService,
    SubscriptionAdminReportingOfflineCustomerService,
    SubscriptionAdminReportingManualSubscriptionService,
    SubscriptionAdminReportingRenewalService,
    SubscriptionSchedulerService,
    OfflineCustomerService,
    StoreSelfDeliveryService,
    StoreMilkGridService,
    StoreMilkGridGridService,
    StoreMilkGridQuickActionService,
    StoreMilkGridDispatchService,
    StoreMilkGridStatementService,
  ],
  exports: [
    SubscriptionCalendarService,
    SubscriptionServiceabilityService,
    TrustedDropService,
    SubscriptionOrderGenerator,
    DeliveryRunPlanningService,
    RegionalDeliveryZoneService,
    RegionalRoutePlanningService,
    RegionalRouteOperationsService,
    SubscriptionCashFundingService,
    SubscriptionPreparationService,
    OfflineCustomerService,
    StoreSelfDeliveryService,
    StoreMilkGridService,
  ],
})
export class SubscriptionsModule {}
