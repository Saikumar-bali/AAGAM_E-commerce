import { Module } from '@nestjs/common';
import { StoreService } from './store.service';
import { StoreController } from './store.controller';
import { StoreOwnerController } from './store-owner.controller';
import { StoreOwnerService } from './store-owner.service';
import { StoreOrdersController } from './store-orders.controller';
import { DeliveryFeeRulesController } from './delivery-fee-rules.controller';
import { DeliveryFeeRulesService } from './delivery-fee-rules.service';

@Module({
  controllers: [StoreController, StoreOwnerController, StoreOrdersController, DeliveryFeeRulesController],
  providers: [StoreService, StoreOwnerService, DeliveryFeeRulesService],
  exports: [DeliveryFeeRulesService],
})
export class StoreModule {}