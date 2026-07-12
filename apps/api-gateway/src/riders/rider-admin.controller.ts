import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Role } from "@aagam/database";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import {
  AdminRiderEarningDto,
  AdminRiderReviewDto,
  AdminRiderShiftDto,
  AdminSupportStatusDto,
  RiderSupportMessageDto,
} from "./rider-portal.dto";
import { RiderPortalService } from "./rider-portal.service";

@Controller("riders/admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class RiderAdminController {
  constructor(private readonly portal: RiderPortalService) {}

  @Post(":riderProfileId/shifts")
  createShift(
    @Param("riderProfileId") riderId: string,
    @Body() body: AdminRiderShiftDto,
    @Req() req: any
  ) {
    return this.portal.adminCreateShift(riderId, body, req.user.id);
  }

  @Post(":riderProfileId/earnings")
  createEarning(
    @Param("riderProfileId") riderId: string,
    @Body() body: AdminRiderEarningDto,
    @Req() req: any
  ) {
    return this.portal.adminCreateEarning(riderId, body, req.user.id);
  }

  @Patch("earnings/:earningId/paid")
  markEarningPaid(@Param("earningId") earningId: string, @Req() req: any) {
    return this.portal.adminMarkEarningPaid(earningId, req.user.id);
  }

  @Patch("documents/:documentId/review")
  reviewDocument(
    @Param("documentId") documentId: string,
    @Body() body: AdminRiderReviewDto,
    @Req() req: any
  ) {
    return this.portal.adminReviewDocument(documentId, body, req.user.id);
  }

  @Patch(":riderProfileId/approval")
  reviewProfile(
    @Param("riderProfileId") riderId: string,
    @Body() body: AdminRiderReviewDto,
    @Req() req: any
  ) {
    return this.portal.adminReviewProfile(riderId, body, req.user.id);
  }

  @Patch(":riderProfileId/bank-review")
  reviewBank(
    @Param("riderProfileId") riderId: string,
    @Body() body: AdminRiderReviewDto,
    @Req() req: any
  ) {
    return this.portal.adminReviewBank(riderId, body, req.user.id);
  }

  @Patch("support/:ticketId/status")
  supportStatus(
    @Param("ticketId") ticketId: string,
    @Body() body: AdminSupportStatusDto,
    @Req() req: any
  ) {
    return this.portal.adminSupportStatus(ticketId, body.status, req.user.id);
  }

  @Post("support/:ticketId/messages")
  supportReply(
    @Param("ticketId") ticketId: string,
    @Body() body: RiderSupportMessageDto,
    @Req() req: any
  ) {
    return this.portal.adminSupportReply(ticketId, body, req.user.id);
  }
}
