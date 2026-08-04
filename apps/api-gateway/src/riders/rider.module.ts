import { Module } from '@nestjs/common';
import { OrderModule } from '../orders/order.module';
import { RiderAdminController } from './rider-admin.controller';
import { RiderController } from './rider.controller';
import { RiderPortalController } from './rider-portal.controller';
import { RiderPortalService } from './rider-portal.service';
import { RiderService } from './rider.service';

@Module({
  imports: [OrderModule],
  controllers: [RiderController, RiderPortalController, RiderAdminController],
  providers: [RiderService, RiderPortalService],
})
export class RiderModule {}
