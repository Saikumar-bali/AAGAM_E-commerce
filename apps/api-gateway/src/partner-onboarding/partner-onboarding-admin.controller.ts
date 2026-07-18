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
} from '@nestjs/common';
import { Role } from '@aagam/database';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  AdminPartnerListQueryDto,
  ApprovePartnerApplicationDto,
  RejectPartnerApplicationDto,
  RequestPartnerChangesDto,
  ReviewPartnerApplicationDto,
  ReviewPartnerDocumentDto,
} from './dto/partner-onboarding.dto';
import { PartnerOnboardingAdminService } from './partner-onboarding-admin.service';

@Controller('admin/partner-onboarding')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class PartnerOnboardingAdminController {
  constructor(private readonly onboarding: PartnerOnboardingAdminService) {}

  @Get('applications')
  list(@Query() query: AdminPartnerListQueryDto) {
    return this.onboarding.list(query);
  }

  @Get('applications/:id')
  detail(@Param('id') id: string) {
    return this.onboarding.detail(id);
  }

  @Post('applications/:id/review')
  startReview(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: ReviewPartnerApplicationDto,
  ) {
    return this.onboarding.startReview(id, req.user.id, dto.note);
  }

  @Patch('applications/:id/documents/:documentId/review')
  reviewDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Req() req: any,
    @Body() dto: ReviewPartnerDocumentDto,
  ) {
    return this.onboarding.reviewDocument(
      id,
      documentId,
      req.user.id,
      dto,
    );
  }

  @Get('applications/:id/documents/:documentId/url')
  documentUrl(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ) {
    return this.onboarding.documentUrl(id, documentId);
  }

  @Post('applications/:id/request-changes')
  requestChanges(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: RequestPartnerChangesDto,
  ) {
    return this.onboarding.requestChanges(id, req.user.id, dto);
  }

  @Post('applications/:id/reject')
  reject(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: RejectPartnerApplicationDto,
  ) {
    return this.onboarding.reject(id, req.user.id, dto);
  }

  @Post('applications/:id/approve')
  approve(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: ApprovePartnerApplicationDto,
  ) {
    return this.onboarding.approveAndProvision(id, req.user.id, dto);
  }
}
