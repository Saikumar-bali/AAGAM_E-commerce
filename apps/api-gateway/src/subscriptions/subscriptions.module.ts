import { Module, forwardRef } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { OrderModule } from '../orders/order.module';
import { UploadModule } from '../upload/upload.module';
import { CashDepositBatchService } from './cash-deposit-batch.service';
import { CustomerSubscriptionService } from './customer-subscription.service';
import { DeliveryRunOperationsService } from './delivery-run-operations.service';
import { DeliveryRunPlanningService } from './delivery-run-planning.service';
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
import { SubscriptionRiderCapacityNotificationService } from './subscription-rider-capacity-notification.service';
import { SubscriptionAdminReportingService } from './subscription-admin-reporting.service';
import { SubscriptionCalendarService } from './subscription-calendar.service';
import { SubscriptionCashFundingService } from './subscription-cash-funding.service';
import { SubscriptionOrderGenerator } from './subscription-order-generator.service';
import { SubscriptionPlanService } from './subscription-plan.service';
import { SubscriptionSchedulerService } from './subscription-scheduler.service';
import { SubscriptionServiceabilityService } from './subscription-serviceability.service';
import { TrustedDropAddressPolicyInterceptor } from './trusted-drop-address-policy.interceptor';
import { TrustedDropService } from './trusted-drop.service';
import {
  AdminSubscriptionsController,
  CustomerSubscriptionsController,
  RiderDeliveryRunsController,
  StoreSubscriptionOperationsController,
  SubscriptionPlanPublicController,
} from './subscriptions.controller';

@Module({
  imports: [forwardRef(() => OrderModule), UploadModule],
  controllers: [
    SubscriptionPlanPublicController,
    CustomerSubscriptionsController,
    RiderDeliveryRunsController,
    StoreSubscriptionOperationsController,
    StoreSubscriptionPreparationController,
    AdminSubscriptionsController,
    AdminSubscriptionPreparationController,
    AdminRegionalRoutingController,
    RegionalRoutingEventsController,
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
    SubscriptionSchedulerService,
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
  ],
})
export class SubscriptionsModule {}
