import { Module } from '@nestjs/common';
import { StoreService } from './store.service';
import { StoreController } from './store.controller';
import { StoreOwnerController } from './store-owner.controller';
import { StoreOwnerService } from './store-owner.service';
import { StoreOrdersController } from './store-orders.controller';

@Module({
  controllers: [StoreController, StoreOwnerController, StoreOrdersController],
  providers: [StoreService, StoreOwnerService],
})
export class StoreModule {}