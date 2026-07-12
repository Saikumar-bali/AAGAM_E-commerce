import {
  Body,
  Controller,
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
  PickupProblemDto,
  RiderAvailabilityDto,
  RiderBreakDto,
  RiderDocumentDto,
  RiderHistoryQueryDto,
  RiderProfileDto,
  RiderStatusDto,
  RiderSupportMessageDto,
  RiderSupportTicketDto,
  VerifyPickupDto,
} from "./rider-portal.dto";
import { RiderPortalService } from "./rider-portal.service";

@Controller("riders/portal")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.RIDER)
export class RiderPortalController {
  constructor(private readonly portal: RiderPortalService) {}

  @Get("home")
  home(@Req() req: any) {
    return this.portal.home(req.user.id);
  }

  @Get("offers")
  offers(@Req() req: any) {
    return this.portal.offers(req.user.id);
  }

  @Get("delivery")
  delivery(@Req() req: any) {
    return this.portal.currentDelivery(req.user.id);
  }

  @Get("history")
  history(@Req() req: any, @Query() query: RiderHistoryQueryDto) {
    return this.portal.history(req.user.id, query);
  }

  @Get("pickup")
  pickup(@Req() req: any) {
    return this.portal.pickup(req.user.id);
  }

  @Post("pickup/:deliveryJobId/verify")
  verifyPickup(
    @Req() req: any,
    @Param("deliveryJobId") jobId: string,
    @Body() body: VerifyPickupDto
  ) {
    return this.portal.verifyPickup(req.user.id, jobId, body);
  }

  @Post("pickup/:deliveryJobId/problem")
  pickupProblem(
    @Req() req: any,
    @Param("deliveryJobId") jobId: string,
    @Body() body: PickupProblemDto
  ) {
    return this.portal.reportPickupProblem(req.user.id, jobId, body);
  }

  @Get("earnings")
  earnings(@Req() req: any, @Query() query: RiderHistoryQueryDto) {
    return this.portal.earnings(req.user.id, query);
  }

  @Get("cod")
  cod(@Req() req: any) {
    return this.portal.cod(req.user.id);
  }

  @Get("performance")
  performance(@Req() req: any, @Query() query: RiderHistoryQueryDto) {
    return this.portal.performance(req.user.id, query);
  }

  @Get("availability")
  availability(@Req() req: any) {
    return this.portal.availability(req.user.id);
  }

  @Patch("availability/status")
  setStatus(@Req() req: any, @Body() body: RiderStatusDto) {
    return this.portal.setStatus(req.user.id, body.status);
  }

  @Patch("availability/schedule")
  setSchedule(@Req() req: any, @Body() body: RiderAvailabilityDto) {
    return this.portal.setSchedule(req.user.id, body.entries);
  }

  @Post("availability/break/start")
  startBreak(@Req() req: any, @Body() body: RiderBreakDto) {
    return this.portal.startBreak(req.user.id, body.reason);
  }

  @Post("availability/break/end")
  endBreak(@Req() req: any) {
    return this.portal.endBreak(req.user.id);
  }

  @Get("profile")
  profile(@Req() req: any) {
    return this.portal.profile(req.user.id);
  }

  @Patch("profile")
  updateProfile(@Req() req: any, @Body() body: RiderProfileDto) {
    return this.portal.updateProfile(req.user.id, body);
  }

  @Post("documents")
  addDocument(@Req() req: any, @Body() body: RiderDocumentDto) {
    return this.portal.addDocument(req.user.id, body);
  }

  @Get("support")
  support(@Req() req: any) {
    return this.portal.support(req.user.id);
  }

  @Post("support")
  createSupport(@Req() req: any, @Body() body: RiderSupportTicketDto) {
    return this.portal.createSupport(req.user.id, body);
  }

  @Get("support/:ticketId")
  supportTicket(@Req() req: any, @Param("ticketId") ticketId: string) {
    return this.portal.supportTicket(req.user.id, ticketId);
  }

  @Post("support/:ticketId/messages")
  supportMessage(
    @Req() req: any,
    @Param("ticketId") ticketId: string,
    @Body() body: RiderSupportMessageDto
  ) {
    return this.portal.addSupportMessage(req.user.id, ticketId, body);
  }
}
