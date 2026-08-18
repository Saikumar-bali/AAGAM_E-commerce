import { Module } from '@nestjs/common';

import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { PromotionsModule } from '../promotions/promotions.module';
import { OrderModule } from '../orders/order.module';
import { StoreModule } from '../stores/store.module';

@Module({
  imports: [PromotionsModule, OrderModule, StoreModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}

