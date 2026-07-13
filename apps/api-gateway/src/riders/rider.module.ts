import { Module } from "@nestjs/common";
import { RiderService } from "./rider.service";
import { RiderController } from "./rider.controller";
import { RiderPortalController } from "./rider-portal.controller";
import { RiderPortalService } from "./rider-portal.service";
import { RiderAdminController } from "./rider-admin.controller";

@Module({
  controllers: [RiderController, RiderPortalController, RiderAdminController],
  providers: [RiderService, RiderPortalService],
})
export class RiderModule {}
