/**
 * Subscription admin reporting facade.
 *
 * Split out of the former subscription-admin-reporting.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { Injectable } from '@nestjs/common';
import { CustomerSubscriptionStatus, Role } from '@aagam/database';
import { AdminSubscriptionCorrectionDto, ResolveSubscriptionIssueDto } from './subscriptions.dto';
import { SubscriptionAdminReportingPaymentsService } from './subscription-admin-reporting.payments.service';
import { SubscriptionAdminReportingReadService } from './subscription-admin-reporting.read.service';
import { SubscriptionAdminReportingCorrectionService } from './subscription-admin-reporting.correction.service';
import { SubscriptionAdminReportingIssueService } from './subscription-admin-reporting.issue.service';
import { SubscriptionAdminReportingOfflineCustomerService } from './subscription-admin-reporting.offline-customer.service';
import { SubscriptionAdminReportingManualSubscriptionService } from './subscription-admin-reporting.manual-subscription.service';
import { SubscriptionAdminReportingRenewalService } from './subscription-admin-reporting.renewal.service';

@Injectable()
export class SubscriptionAdminReportingService {
  constructor(
    private readonly payments: SubscriptionAdminReportingPaymentsService,
    private readonly read: SubscriptionAdminReportingReadService,
    private readonly correction: SubscriptionAdminReportingCorrectionService,
    private readonly issue: SubscriptionAdminReportingIssueService,
    private readonly offline: SubscriptionAdminReportingOfflineCustomerService,
    private readonly manual: SubscriptionAdminReportingManualSubscriptionService,
    private readonly renewal: SubscriptionAdminReportingRenewalService,
  ) {}

  async reconcileDeliveredDelivery(deliveryId: string, actorId: string, idempotencyKey?: string) {
    return this.payments.reconcileDeliveredDelivery(deliveryId, actorId, idempotencyKey);
  }

  async recordCustomerPayment(
    subscriptionId: string,
    dto: {
      amountPaise: number;
      paymentMode?: 'CASH' | 'PHONE_PE';
      reference?: string;
      note?: string;
    },
    actorId: string,
    actorRole: Role = Role.ADMIN,
  ) {
    return this.payments.recordCustomerPayment(subscriptionId, dto, actorId, actorRole);
  }

  subscribers(status?: CustomerSubscriptionStatus, planId?: string) {
    return this.read.subscribers(status, planId);
  }

  storeSubscribers(actor: { id: string; role: Role }) {
    return this.read.storeSubscribers(actor);
  }

  storeDeliveryCalendar(actor: { id: string; role: Role }, from?: string, to?: string) {
    return this.read.storeDeliveryCalendar(actor, from, to);
  }

  async storeAnalytics(actor: { id: string; role: Role }) {
    return this.read.storeAnalytics(actor);
  }

  async subscription(id: string) {
    return this.read.subscription(id);
  }

  deliveryCalendar(from?: string, to?: string) {
    return this.read.deliveryCalendar(from, to);
  }

  routes(serviceDate?: string) {
    return this.read.routes(serviceDate);
  }

  cashControl() {
    return this.read.cashControl();
  }

  exceptions() {
    return this.read.exceptions();
  }

  async analytics() {
    return this.read.analytics();
  }

  async correctSubscription(id: string, dto: AdminSubscriptionCorrectionDto, actorId: string, idempotencyKey?: string) {
    return this.correction.correctSubscription(id, dto, actorId, idempotencyKey);
  }

  async resolveIssue(issueId: string, dto: ResolveSubscriptionIssueDto, actorId: string) {
    return this.issue.resolveIssue(issueId, dto, actorId);
  }

  async createOfflineCustomer(
    dto: { name: string; phone: string; line1: string; line2?: string; landmark?: string; city: string; state: string; pincode: string; latitude?: number; longitude?: number; storeId?: string },
    actor?: { id: string; role: Role },
  ) {
    return this.offline.createOfflineCustomer(dto, actor);
  }

  async createManualSubscription(dto: {
    storeId: string;
    planId: string;
    customerId: string;
    addressId: string;
    startDate: string;
    totalDeliveries: number;
    deliverySlot?: 'MORNING' | 'EVENING' | 'BOTH';
    initialCashCollectedPaise?: number;
    storeDelivery?: boolean;
    note?: string;
    frequency?: 'DAILY' | 'ALTERNATE_DAYS' | 'WEEKDAYS' | 'SELECTED_WEEKDAYS';
    selectedWeekdays?: number[];
    vacationRange?: { fromDate?: string; toDate?: string; policy?: 'EXTEND_PLAN' | 'DEDUCT_BILL' };
    splitItems?: { amProductName?: string; amQuantity?: string; pmProductName?: string; pmQuantity?: string };
  }, actorId: string) {
    return this.manual.createManualSubscription(dto, actorId);
  }

  async updateManualSubscription(id: string, dto: { startDate?: string; totalDeliveries?: number; deliverySlot?: 'MORNING' | 'EVENING' | 'BOTH'; amountDuePaise?: number; amountCollectedPaise?: number; note?: string }, actorId: string) {
    return this.manual.updateManualSubscription(id, dto, actorId);
  }

  async createCustomManualSubscription(dto: {
    storeId: string;
    customerId: string;
    addressId: string;
    totalPricePaise: number;
    initialCashCollectedPaise?: number;
    storeDelivery?: boolean;
    note?: string;
    deliveries: Array<{
      date: string;
      slot: 'AM' | 'PM' | 'BOTH';
      items: Array<{ productId: string; quantity: number; pricePaise: number }>;
    }>;
  }, actorId: string) {
    return this.manual.createCustomManualSubscription(dto, actorId);
  }

  async renewSubscription(
    subscriptionId: string,
    dto: {
      additionalDeliveries?: number;
      additionalAmountPaise?: number;
      totalDeliveries?: number;
      startDate?: string;
      isSamePlan?: boolean;
      newPlanId?: string;
      deliverySlot?: 'MORNING' | 'EVENING' | 'BOTH' | 'AM' | 'PM';
      frequency?: 'DAILY' | 'ALTERNATE_DAYS' | 'WEEKDAYS' | 'SELECTED_WEEKDAYS';
      selectedWeekdays?: number[];
      vacationRange?: {
        fromDate?: string;
        toDate?: string;
        policy?: 'EXTEND_PLAN' | 'DEDUCT_BILL';
      };
      splitItems?: {
        amProductName?: string;
        amQuantity?: string;
        pmProductName?: string;
        pmQuantity?: string;
      };
      initialCashCollectedPaise?: number;
      paymentMode?: 'CASH' | 'PHONE_PE';
      note?: string;
    },
    actorId: string,
    actorRole: Role = Role.ADMIN,
  ) {
    return this.renewal.renewSubscription(subscriptionId, dto, actorId, actorRole);
  }

  async cancelSubscription(
    subscriptionId: string,
    reason: string,
    actorId: string,
    actorRole: Role = Role.ADMIN,
  ) {
    return this.renewal.cancelSubscription(subscriptionId, reason, actorId, actorRole);
  }
}
