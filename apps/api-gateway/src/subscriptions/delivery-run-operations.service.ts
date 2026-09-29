/**
 * Delivery run operations facade.
 *
 * Split out of the former delivery-run-operations.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { Injectable } from '@nestjs/common';
import { Actor } from './delivery-run-operations.service.base';
import { DeliveryWorkflowService } from '../orders/delivery-workflow.service';
import { DeliveryOperationsService } from '../orders/delivery-operations.service';
import { SubscriptionCashFundingService } from './subscription-cash-funding.service';
import { TrustedDropService } from './trusted-drop.service';
import { ArriveRunStopDto, CompleteRunStopDto, ConfirmRunPickupReceiptDto, FailRunStopDto, ReorderRunStopDto, RiderExtraMilkDto, RiderRecordPaymentDto, RiderToggleSlotDto, RunVersionDto } from './subscriptions.dto';
import { DeliveryRunReadService } from './delivery-run-read.service';
import { DeliveryRunPickupService } from './delivery-run-pickup.service';
import { DeliveryRunStopService } from './delivery-run-stop.service';
import { DeliveryRunCloseService } from './delivery-run-close.service';
import { DeliveryRunFieldService } from './delivery-run-field.service';

@Injectable()
export class DeliveryRunOperationsService {
  private readonly read: DeliveryRunReadService;
  private readonly pickup: DeliveryRunPickupService;
  private readonly stop: DeliveryRunStopService;
  private readonly close: DeliveryRunCloseService;
  private readonly field: DeliveryRunFieldService;

  constructor(
    workflow: DeliveryWorkflowService,
    deliveryOperations: DeliveryOperationsService,
    funding: SubscriptionCashFundingService,
    trustedDrop: TrustedDropService,
  ) {
    this.read = new DeliveryRunReadService();
    this.pickup = new DeliveryRunPickupService(workflow);
    this.stop = new DeliveryRunStopService(workflow, deliveryOperations, funding, trustedDrop);
    this.close = new DeliveryRunCloseService();
    this.field = new DeliveryRunFieldService();
  }

  async today(actor: Actor, date?: string) {
    return this.read.today(actor, date);
  }

  async details(runId: string, actor: Actor) {
    return this.read.details(runId, actor);
  }

  async confirmPickupReceipt(runId: string, dto: ConfirmRunPickupReceiptDto, actor: Actor) {
    return this.pickup.confirmPickupReceipt(runId, dto, actor);
  }

  async start(runId: string, dto: RunVersionDto, actor: Actor) {
    return this.pickup.start(runId, dto, actor);
  }

  async arrive(runId: string, stopId: string, dto: ArriveRunStopDto, actor: Actor) {
    return this.stop.arrive(runId, stopId, dto, actor);
  }

  async issueOtp(runId: string, stopId: string, actor: Actor, idempotencyKey?: string) {
    return this.stop.issueOtp(runId, stopId, actor, idempotencyKey);
  }

  async complete(runId: string, stopId: string, dto: CompleteRunStopDto, actor: Actor, idempotencyKey?: string) {
    return this.stop.complete(runId, stopId, dto, actor, idempotencyKey);
  }

  async fail(runId: string, stopId: string, dto: FailRunStopDto, actor: Actor, idempotencyKey?: string) {
    return this.stop.fail(runId, stopId, dto, actor, idempotencyKey);
  }

  async reorder(runId: string, stopId: string, dto: ReorderRunStopDto, actor: Actor) {
    return this.stop.reorder(runId, stopId, dto, actor);
  }

  async finish(runId: string, dto: RunVersionDto, actor: Actor) {
    return this.close.finish(runId, dto, actor);
  }

  async cashAccountability(runId: string, actor: Actor) {
    return this.close.cashAccountability(runId, actor);
  }

  async extraMilk(
    runId: string,
    stopId: string,
    dto: RiderExtraMilkDto,
    actor: Actor,
  ) {
    return this.field.extraMilk(runId, stopId, dto, actor);
  }

  async toggleSlot(
    runId: string,
    stopId: string,
    dto: RiderToggleSlotDto,
    actor: Actor,
  ) {
    return this.field.toggleSlot(runId, stopId, dto, actor);
  }

  async recordPayment(
    runId: string,
    stopId: string,
    dto: RiderRecordPaymentDto,
    actor: Actor,
  ) {
    return this.field.recordPayment(runId, stopId, dto, actor);
  }

  async skipStop(
    runId: string,
    stopId: string,
    dto: { reason?: string; note?: string },
    actor: Actor,
  ) {
    return this.field.skipStop(runId, stopId, dto, actor);
  }
}
