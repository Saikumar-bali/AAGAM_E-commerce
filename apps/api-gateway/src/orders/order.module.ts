import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { StoreFulfillmentController } from './store-fulfillment.controller';
import { StoreFulfillmentService } from './store-fulfillment.service';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';
import { AuditedDispatchService } from './audited-dispatch.service';
import { DeliveryEventService } from './delivery-event.service';
import { DeliveryJobService } from './delivery-job.service';
import { DeliveryWorkflowService } from './delivery-workflow.service';
import { DispatchAssignmentService } from './dispatch-assignment.service';
import { DeliveryOperationsService } from './delivery-operations.service';
import { PostDeliveryController } from './post-delivery.controller';
import { PostDeliveryService } from './post-delivery.service';
import { DeliveryOperationsController } from './delivery-operations.controller';
import { PaymentsModule } from '../payments/payments.module';
import { AutoDispatchService } from './auto-dispatch.service';
import { CustomerDeliveryContextController } from './customer-delivery-context.controller';
import { PickupReadinessController } from './pickup-readiness.controller';
import { RiderArrivalEvidenceInterceptor } from './rider-arrival-evidence.interceptor';

@Module({
  imports: [PaymentsModule],
  controllers: [
    OrderController,
    StoreFulfillmentController,
    DispatchController,
    PostDeliveryController,
    DeliveryOperationsController,
    CustomerDeliveryContextController,
    PickupReadinessController,
  ],
  providers: [
    OrderService,
    DeliveryEventService,
    DeliveryJobService,
    DeliveryWorkflowService,
    StoreFulfillmentService,
    {
      provide: DispatchService,
      useClass: AuditedDispatchService,
    },
    DeliveryOperationsService,
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
      ) => new DispatchAssignmentService(jobs, workflow, events, autoDispatch),
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
    DeliveryEventService,
    DeliveryJobService,
    DeliveryWorkflowService,
    DispatchAssignmentService,
    AutoDispatchService,
  ],
})
export class OrderModule {}
