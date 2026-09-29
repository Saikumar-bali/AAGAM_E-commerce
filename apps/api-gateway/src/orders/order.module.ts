import { Module, forwardRef } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PaymentsModule } from '../payments/payments.module';
import { UploadModule } from '../upload/upload.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AuditedDispatchService } from './audited-dispatch.service';
import { AutoDispatchService } from './auto-dispatch.service';
import { CodSettlementFacadeService } from './cod-settlement-facade.service';
import { CustomerDeliveryContextController } from './customer-delivery-context.controller';
import { DeliveryEventService } from './delivery-event.service';
import { DeliveryJobService } from './delivery-job.service';
import { DeliveryOperationsController } from './delivery-operations.controller';
import { DeliveryOperationsService } from './delivery-operations.service';
import { DeliveryOperationsQueryService } from './delivery-operations.query.service';
import { DeliveryOperationsPickupService } from './delivery-operations.pickup.service';
import { DeliveryOperationsOtpService } from './delivery-operations.otp.service';
import { DeliveryOperationsDeliveryService } from './delivery-operations.delivery.service';
import { DeliveryOperationsCodService } from './delivery-operations.cod.service';
import { DeliveryOperationsFailureService } from './delivery-operations.failure.service';
import { DeliveryOperationsReturnService } from './delivery-operations.return.service';
import { DeliveryPhotoProofController } from './delivery-photo-proof.controller';
import { DeliveryPhotoProofService } from './delivery-photo-proof.service';
import { DeliveryWorkflowService } from './delivery-workflow.service';
import { DispatchAssignmentService } from './dispatch-assignment.service';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';
import { EligibleDispatchAssignmentService } from './eligible-dispatch-assignment.service';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { OrderCreationService } from './order-creation.service';
import { PickupReadinessController } from './pickup-readiness.controller';
import { PostDeliveryController } from './post-delivery.controller';
import { PostDeliveryService } from './post-delivery.service';
import { RiderArrivalEvidenceInterceptor } from './rider-arrival-evidence.interceptor';
import { StoreFulfillmentController } from './store-fulfillment.controller';
import { StoreFulfillmentService } from './store-fulfillment.service';
import { ExcelSyncController } from './excel-sync.controller';

@Module({
  imports: [PaymentsModule, UploadModule, forwardRef(() => SubscriptionsModule)],
  controllers: [
    ExcelSyncController,
    OrderController,
    StoreFulfillmentController,
    DispatchController,
    PostDeliveryController,
    DeliveryOperationsController,
    DeliveryPhotoProofController,
    CustomerDeliveryContextController,
    PickupReadinessController,
  ],
  providers: [
    OrderService,
    OrderCreationService,
    DeliveryEventService,
    DeliveryJobService,
    DeliveryWorkflowService,
    StoreFulfillmentService,
    {
      provide: DispatchService,
      useClass: AuditedDispatchService,
    },
    DeliveryOperationsService,
    DeliveryOperationsQueryService,
    DeliveryOperationsPickupService,
    DeliveryOperationsOtpService,
    DeliveryOperationsDeliveryService,
    DeliveryOperationsCodService,
    DeliveryOperationsFailureService,
    DeliveryOperationsReturnService,
    DeliveryPhotoProofService,
    CodSettlementFacadeService,
    PostDeliveryService,
    AutoDispatchService,
    RiderArrivalEvidenceInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useExisting: RiderArrivalEvidenceInterceptor,
    },
    {
      provide: DispatchAssignmentService,
      useFactory: (
        jobs: DeliveryJobService,
        workflow: DeliveryWorkflowService,
        events: DeliveryEventService,
        autoDispatch: AutoDispatchService,
      ) =>
        new EligibleDispatchAssignmentService(
          jobs,
          workflow,
          events,
          autoDispatch,
        ),
      inject: [
        DeliveryJobService,
        DeliveryWorkflowService,
        DeliveryEventService,
        AutoDispatchService,
      ],
    },
  ],
  exports: [
    OrderService,
    OrderCreationService,
    DeliveryEventService,
    DeliveryJobService,
    DeliveryWorkflowService,
    DispatchAssignmentService,
    AutoDispatchService,
    DeliveryOperationsService,
    CodSettlementFacadeService,
  ],
})
export class OrderModule {}
