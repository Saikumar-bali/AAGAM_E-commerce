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
  RiderContactDto,
  RiderDocumentDto,
  RiderHistoryQueryDto,
  RiderProfileDto,
  RiderStatusDto,
  RiderSupportMessageDto,
  RiderSupportTicketDto,
  VerifyPickupDto,
} from "./rider-portal.dto";
import { RiderPortalReadService } from "./rider-portal-read.service";
import { RiderPortalSecureService } from "./rider-portal-secure.service";
import { RiderPortalService } from "./rider-portal.service";

@Controller("riders/portal")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.RIDER)
export class RiderPortalController {
  constructor(
    private readonly portal: RiderPortalService,
    private readonly read: RiderPortalReadService,
    private readonly secure: RiderPortalSecureService
  ) {}

  @Get("home")
  home(@Req() req: any) {
    return this.portal.home(req.user.id);
  }

  @Get("offers")
  offers(@Req() req: any) {
    return this.portal.offers(req.user.id);
  }

  @Get("offers/:assignmentId")
  offerDetail(
    @Req() req: any,
    @Param("assignmentId") assignmentId: string
  ) {
    return this.secure.offerDetail(req.user.id, assignmentId);
  }

  @Get("delivery")
  delivery(@Req() req: any) {
    return this.portal.currentDelivery(req.user.id);
  }

  @Get("history")
  history(@Req() req: any, @Query() query: RiderHistoryQueryDto) {
    return this.secure.history(req.user.id, query);
  }

  @Get("history/:deliveryJobId")
  historyDetail(
    @Req() req: any,
    @Param("deliveryJobId") deliveryJobId: string
  ) {
    return this.secure.historyDetail(req.user.id, deliveryJobId);
  }

  @Get("receipts/:deliveryJobId")
  receipt(
    @Req() req: any,
    @Param("deliveryJobId") deliveryJobId: string
  ) {
    return this.secure.receipt(req.user.id, deliveryJobId);
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
  async pickupProblem(
    @Req() req: any,
    @Param("deliveryJobId") jobId: string,
    @Body() body: PickupProblemDto
  ) {
    const task = await this.portal.reportPickupProblem(
      req.user.id,
      jobId,
      body
    );
    if (body.evidenceKeys?.length) {
      const ticket = await this.portal.createSupport(req.user.id, {
        deliveryJobId: jobId,
        category: "PICKUP",
        subject: `Pickup evidence: ${body.problemType.replaceAll("_", " ")}`,
        description: body.note,
        evidenceKeys: body.evidenceKeys,
      });
      return { task, supportTicketId: ticket.id };
    }
    return { task, supportTicketId: null };
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
  async availability(@Req() req: any) {
    const availability = await this.portal.availability(req.user.id);
    return { ...availability, ...this.read.availabilityMetadata() };
  }

  @Patch("availability/status")
  setStatus(@Req() req: any, @Body() body: RiderStatusDto) {
    return this.portal.setStatus(req.user.id, body.status);
  }

  @Patch("availability/schedule")
  setSchedule(@Req() req: any, @Body() body: RiderAvailabilityDto) {
    this.read.assertSchedule(body.entries);
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
    return this.read.profile(req.user.id);
  }

  @Patch("profile")
  updateProfile(@Req() req: any, @Body() body: RiderProfileDto) {
    return this.portal.updateProfile(req.user.id, body);
  }

  @Post("documents")
  addDocument(@Req() req: any, @Body() body: RiderDocumentDto) {
    return this.portal.addDocument(req.user.id, body);
  }

  @Get("documents/:documentId/preview")
  documentPreview(
    @Req() req: any,
    @Param("documentId") documentId: string
  ) {
    return this.read.documentPreview(req.user.id, documentId);
  }

  @Post("contact/:deliveryJobId")
  contact(
    @Req() req: any,
    @Param("deliveryJobId") deliveryJobId: string,
    @Body() body: RiderContactDto
  ) {
    return this.secure.contact(req.user.id, deliveryJobId, body);
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
