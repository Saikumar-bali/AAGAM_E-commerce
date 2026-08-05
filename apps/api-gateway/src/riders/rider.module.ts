import { Module } from '@nestjs/common';
import { OrderModule } from '../orders/order.module';
import { UploadModule } from '../upload/upload.module';
import { EligibleRiderPortalService } from './eligible-rider-portal.service';
import { RiderAdminController } from './rider-admin.controller';
import { RiderController } from './rider.controller';
import { RiderPortalController } from './rider-portal.controller';
import { RiderPortalReadService } from './rider-portal-read.service';
import { RiderPortalSecureService } from './rider-portal-secure.service';
import { RiderPortalService } from './rider-portal.service';
import { RiderService } from './rider.service';

@Module({
  imports: [OrderModule, UploadModule],
  controllers: [RiderController, RiderPortalController, RiderAdminController],
  providers: [
    RiderService,
    RiderPortalReadService,
    RiderPortalSecureService,
    {
      provide: RiderPortalService,
      useClass: EligibleRiderPortalService,
    },
  ],
})
export class RiderModule {}
