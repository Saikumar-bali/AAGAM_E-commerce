import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Role } from "@aagam/database";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import {
  PromotionPlacementQueryDto,
  UpsertCouponDto,
  UpsertPromotionCampaignDto,
} from "./promotions.dto";
import { PromotionsService } from "./promotions.service";

@Controller("promotions")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER)
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Get("active")
  active(@Req() req: any, @Query() query: PromotionPlacementQueryDto) {
    return this.promotionsService.activeCampaigns(req.user.id, query.placement);
  }

  @Get("deals")
  deals(@Req() req: any) {
    return this.promotionsService.deals(req.user.id);
  }
}

@Controller("admin/promotions")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminPromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Get("campaigns")
  campaigns() {
    return this.promotionsService.adminCampaigns();
  }

  @Post("campaigns")
  createCampaign(@Req() req: any, @Body() dto: UpsertPromotionCampaignDto) {
    return this.promotionsService.createCampaign(req.user.id, dto);
  }

  @Patch("campaigns/:id")
  updateCampaign(
    @Param("id") id: string,
    @Body() dto: UpsertPromotionCampaignDto
  ) {
    return this.promotionsService.updateCampaign(id, dto);
  }

  @Delete("campaigns/:id")
  archiveCampaign(@Param("id") id: string) {
    return this.promotionsService.archiveCampaign(id);
  }

  @Get("coupons")
  coupons() {
    return this.promotionsService.adminCoupons();
  }

  @Post("coupons")
  createCoupon(@Req() req: any, @Body() dto: UpsertCouponDto) {
    return this.promotionsService.createCoupon(req.user.id, dto);
  }

  @Patch("coupons/:id")
  updateCoupon(@Param("id") id: string, @Body() dto: UpsertCouponDto) {
    return this.promotionsService.updateCoupon(id, dto);
  }

  @Delete("coupons/:id")
  archiveCoupon(@Param("id") id: string) {
    return this.promotionsService.archiveCoupon(id);
  }
}
