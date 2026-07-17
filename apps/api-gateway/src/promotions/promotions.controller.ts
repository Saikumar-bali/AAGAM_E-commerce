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
import { CouponStatus, Role } from "@aagam/database";
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
    // The admin UI's primary action means “place this coupon”. Historically it
    // sent the form default DRAFT, which made a successful save invisible to
    // every customer client. Publish immediately unless the configured start
    // time is in the future, in which case preserve the schedule explicitly.
    const requestedStart = dto.startsAt ? new Date(dto.startsAt) : null;
    const status =
      dto.status === undefined || dto.status === CouponStatus.DRAFT
        ? requestedStart && requestedStart.getTime() > Date.now()
          ? CouponStatus.SCHEDULED
          : CouponStatus.ACTIVE
        : dto.status;

    return this.promotionsService.createCoupon(req.user.id, {
      ...dto,
      status,
    });
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
