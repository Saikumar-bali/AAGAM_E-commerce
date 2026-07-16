import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { StoreFulfillmentController } from './store-fulfillment.controller';
import { StoreFulfillmentService } from './store-fulfillment.service';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';
import { PostDeliveryController } from './post-delivery.controller';
import { PostDeliveryService } from './post-delivery.service';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PaymentsModule],
  controllers: [
    OrderController,
    StoreFulfillmentController,
    DispatchController,
    PostDeliveryController,
  ],
  providers: [
    OrderService,
    StoreFulfillmentService,
    DispatchService,
    PostDeliveryService,
  ],
  exports: [OrderService],
})
export class OrderModule {}
