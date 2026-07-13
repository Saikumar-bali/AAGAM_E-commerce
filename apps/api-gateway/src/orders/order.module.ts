import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { StoreFulfillmentController } from './store-fulfillment.controller';
import { StoreFulfillmentService } from './store-fulfillment.service';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';
import { DeliveryEventService } from './delivery-event.service';
import { DeliveryJobService } from './delivery-job.service';
import { DeliveryWorkflowService } from './delivery-workflow.service';
import { DispatchAssignmentService } from './dispatch-assignment.service';
import { PostDeliveryController } from './post-delivery.controller';
import { PostDeliveryService } from './post-delivery.service';
import { DeliveryOperationsController } from './delivery-operations.controller';
import { DeliveryOperationsService } from './delivery-operations.service';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PaymentsModule],
  controllers: [
    OrderController,
    StoreFulfillmentController,
    DispatchController,
    PostDeliveryController,
    DeliveryOperationsController,
  ],
  providers: [
    OrderService,
    DeliveryEventService,
    DeliveryJobService,
    DeliveryWorkflowService,
    DispatchAssignmentService,
    StoreFulfillmentService,
    DispatchService,
    PostDeliveryService,
    DeliveryOperationsService,
  ],
  exports: [
    OrderService,
    DeliveryEventService,
    DeliveryJobService,
    DeliveryWorkflowService,
    DispatchAssignmentService,
    DeliveryOperationsService,
  ],
})
export class OrderModule {}
