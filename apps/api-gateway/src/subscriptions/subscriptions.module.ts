import { Module } from '@nestjs/common';
import { OrderModule } from '../orders/order.module';
import { CashDepositBatchService } from './cash-deposit-batch.service';
import { CustomerSubscriptionService } from './customer-subscription.service';
import { DeliveryRunOperationsService } from './delivery-run-operations.service';
import { DeliveryRunPlanningService } from './delivery-run-planning.service';
import { AdminRegionalRoutingController, RegionalRoutingEventsController } from './regional-routing.controller';
import { RegionalDeliveryZoneService } from './regional-delivery-zone.service';
import { RegionalRouteOperationsService } from './regional-route-operations.service';
import { RegionalRoutePlanningService } from './regional-route-planning.service';
import { SubscriptionAdminReportingService } from './subscription-admin-reporting.service';
import { SubscriptionCalendarService } from './subscription-calendar.service';
import { SubscriptionCashFundingService } from './subscription-cash-funding.service';
import { SubscriptionOrderGenerator } from './subscription-order-generator.service';
import { SubscriptionPlanService } from './subscription-plan.service';
import { SubscriptionSchedulerService } from './subscription-scheduler.service';
import {
  AdminSubscriptionsController,
  CustomerSubscriptionsController,
  RiderDeliveryRunsController,
  StoreSubscriptionOperationsController,
  SubscriptionPlanPublicController,
} from './subscriptions.controller';

@Module({
  imports: [OrderModule],
  controllers: [
    SubscriptionPlanPublicController,
    CustomerSubscriptionsController,
    RiderDeliveryRunsController,
    StoreSubscriptionOperationsController,
    AdminSubscriptionsController,
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
    SubscriptionCashFundingService,
    CashDepositBatchService,
    SubscriptionAdminReportingService,
    SubscriptionSchedulerService,
  ],
  exports: [
    SubscriptionCalendarService,
    SubscriptionOrderGenerator,
    DeliveryRunPlanningService,
    RegionalDeliveryZoneService,
    RegionalRoutePlanningService,
    RegionalRouteOperationsService,
    SubscriptionCashFundingService,
  ],
})
export class SubscriptionsModule {}
