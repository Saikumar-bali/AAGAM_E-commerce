import { Module } from '@nestjs/common';
import { OrderModule } from '../orders/order.module';
import { UploadModule } from '../upload/upload.module';
import { RiderAdminController } from './rider-admin.controller';
import { RiderController } from './rider.controller';
import { RiderPortalController } from './rider-portal.controller';
import { RiderPlatformService } from './rider-platform.service';
import { RiderPortalService } from './rider-portal.service';
import { RiderService } from './rider.service';

@Module({
  imports: [OrderModule, UploadModule],
  controllers: [RiderController, RiderPortalController, RiderAdminController],
  providers: [RiderService, RiderPortalService, RiderPlatformService],
})
export class RiderModule {}
