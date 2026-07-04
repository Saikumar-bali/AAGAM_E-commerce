import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { StoreFulfillmentController } from './store-fulfillment.controller';
import { StoreFulfillmentService } from './store-fulfillment.service';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PaymentsModule],
  controllers: [
    OrderController,
    StoreFulfillmentController,
  ],
  providers: [
    OrderService,
    StoreFulfillmentService,
  ],
  exports: [OrderService],
})
export class OrderModule {}
