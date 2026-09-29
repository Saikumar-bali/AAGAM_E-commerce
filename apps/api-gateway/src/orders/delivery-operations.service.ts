/**
 * Delivery operations facade.
 *
 * Owns no logic of its own: it exposes the delivery-operations API surface
 * and delegates each use case to a focused service. Split out of the former
 * delivery-operations.service.ts god-service; behaviour is unchanged.
 */
import { Injectable } from "@nestjs/common";
import { Actor, DeliveryCommitHook } from "./delivery-operations.types";
import {
  AdminForceCompleteDeliveryDto,
  AdminReconcileOrderDto,
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
import { DeliveryOperationsQueryService } from "./delivery-operations.query.service";
import { DeliveryOperationsPickupService } from "./delivery-operations.pickup.service";
import { DeliveryOperationsOtpService } from "./delivery-operations.otp.service";
import { DeliveryOperationsDeliveryService } from "./delivery-operations.delivery.service";
import { DeliveryOperationsCodService } from "./delivery-operations.cod.service";
import { DeliveryOperationsFailureService } from "./delivery-operations.failure.service";
import { DeliveryOperationsReturnService } from "./delivery-operations.return.service";

@Injectable()
export class DeliveryOperationsService {
  constructor(
    private readonly queries: DeliveryOperationsQueryService,
    private readonly pickup: DeliveryOperationsPickupService,
    private readonly otp: DeliveryOperationsOtpService,
    private readonly delivery: DeliveryOperationsDeliveryService,
    private readonly cod: DeliveryOperationsCodService,
    private readonly failure: DeliveryOperationsFailureService,
    private readonly returns: DeliveryOperationsReturnService
  ) {}

  getSummary(deliveryJobId: string, actor: Actor) {
    return this.queries.getSummary(deliveryJobId, actor);
  }

  getQueue(actor: Actor) {
    return this.queries.getQueue(actor);
  }

  issuePickupChallenge(deliveryJobId: string, actor: Actor, input: IssuePickupChallengeDto) {
    return this.pickup.issuePickupChallenge(deliveryJobId, actor, input);
  }

  verifyPickupChallenge(deliveryJobId: string, actor: Actor, input: VerifyPickupProofDto) {
    return this.pickup.verifyPickupChallenge(deliveryJobId, actor, input);
  }

  confirmStorePickup(deliveryJobId: string, actor: Actor, input: ConfirmStoreHandoffDto) {
    return this.pickup.confirmStorePickup(deliveryJobId, actor, input);
  }

  issueOtp(deliveryJobId: string, actor: Actor, idempotencyKey?: string) {
    return this.otp.issueOtp(deliveryJobId, actor, idempotencyKey);
  }

  getCustomerOtp(deliveryJobId: string, actor: Actor) {
    return this.otp.getCustomerOtp(deliveryJobId, actor);
  }

  completeDelivery(deliveryJobId: string, actor: Actor, input: CompleteDeliveryOperationDto, idempotencyKey?: string, afterDelivery?: DeliveryCommitHook) {
    return this.delivery.completeDelivery(deliveryJobId, actor, input, idempotencyKey, afterDelivery);
  }

  adminForceCompleteDelivery(deliveryJobId: string, actor: Actor, input: AdminForceCompleteDeliveryDto, idempotencyKey?: string) {
    return this.delivery.adminForceCompleteDelivery(deliveryJobId, actor, input, idempotencyKey);
  }

  adminReconcileDeliveredOrder(deliveryJobId: string, actor: Actor, input: AdminReconcileOrderDto, idempotencyKey?: string) {
    return this.delivery.adminReconcileDeliveredOrder(deliveryJobId, actor, input, idempotencyKey);
  }

  completeCodDelivery(deliveryJobId: string, actor: Actor, input: CompleteDeliveryOperationDto, codInput: CollectCodDto, idempotencyKey?: string, afterDelivery?: DeliveryCommitHook) {
    return this.cod.completeCodDelivery(deliveryJobId, actor, input, codInput, idempotencyKey, afterDelivery);
  }

  completeTrustedDrop(deliveryJobId: string, actor: Actor, input: { riderConfirmed: boolean; evidenceId: string; challengeId: string; note?: string; latitude: number; longitude: number; accuracyMetres?: number }, idempotencyKey?: string, afterDelivery?: DeliveryCommitHook) {
    return this.cod.completeTrustedDrop(deliveryJobId, actor, input, idempotencyKey, afterDelivery);
  }

  collectCod(deliveryJobId: string, actor: Actor, input: CollectCodDto, idempotencyKey?: string) {
    return this.cod.collectCod(deliveryJobId, actor, input, idempotencyKey);
  }

  settleCod(deliveryJobId: string, actor: Actor, input: SettleCodDto, idempotencyKey?: string) {
    return this.cod.settleCod(deliveryJobId, actor, input, idempotencyKey);
  }

  recordFailure(deliveryJobId: string, actor: Actor, input: RecordDeliveryFailureDto, idempotencyKey?: string) {
    return this.failure.recordFailure(deliveryJobId, actor, input, idempotencyKey);
  }

  retryFailedDelivery(deliveryJobId: string, actor: Actor, idempotencyKey?: string) {
    return this.failure.retryFailedDelivery(deliveryJobId, actor, idempotencyKey);
  }

  resolveFailure(deliveryJobId: string, actor: Actor, input: ResolveDeliveryFailureDto, idempotencyKey?: string) {
    return this.failure.resolveFailure(deliveryJobId, actor, input, idempotencyKey);
  }

  startReturn(deliveryJobId: string, actor: Actor, idempotencyKey?: string) {
    return this.returns.startReturn(deliveryJobId, actor, idempotencyKey);
  }

  confirmReturn(deliveryJobId: string, actor: Actor, idempotencyKey?: string) {
    return this.returns.confirmReturn(deliveryJobId, actor, idempotencyKey);
  }

  inspectReturn(deliveryJobId: string, actor: Actor, input: ReturnInspectionDto, idempotencyKey?: string) {
    return this.returns.inspectReturn(deliveryJobId, actor, input, idempotencyKey);
  }
}
