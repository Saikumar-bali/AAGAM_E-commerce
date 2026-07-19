import { Module } from "@nestjs/common";
import {
  AdminPromotionsController,
  PromotionsController,
  PublicPromotionsController,
} from "./promotions.controller";
import { PromotionsService } from "./promotions.service";

@Module({
  controllers: [PromotionsController, PublicPromotionsController, AdminPromotionsController],
  providers: [PromotionsService],
  exports: [PromotionsService],
})
export class PromotionsModule {}
