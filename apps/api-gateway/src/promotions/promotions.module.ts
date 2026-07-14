import { Module } from "@nestjs/common";
import {
  AdminPromotionsController,
  PromotionsController,
} from "./promotions.controller";
import { PromotionsService } from "./promotions.service";

@Module({
  controllers: [PromotionsController, AdminPromotionsController],
  providers: [PromotionsService],
  exports: [PromotionsService],
})
export class PromotionsModule {}
