import { Module } from '@nestjs/common';
import { StoreService } from './store.service';
import { StoreController } from './store.controller';
import { StoreOwnerController } from './store-owner.controller';
import { StoreOwnerService } from './store-owner.service';

@Module({
  controllers: [StoreController, StoreOwnerController],
  providers: [StoreService, StoreOwnerService],
})
export class StoreModule {}
