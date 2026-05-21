import { Module } from '@nestjs/common';
import { OrderModule } from '../orders/order.module';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';

@Module({
  imports: [OrderModule],
  controllers: [TrackingController],
  providers: [TrackingService],
})
export class TrackingModule {}
