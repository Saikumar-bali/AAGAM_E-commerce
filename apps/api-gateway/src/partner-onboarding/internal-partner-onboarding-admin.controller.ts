import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@aagam/database';
import { memoryStorage } from 'multer';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  AdminCreateInternalPartnerDto,
  AdminSubmitInternalPartnerDto,
  AdminUpdateInternalPartnerDto,
} from './dto/admin-internal-partner-onboarding.dto';
import { UploadPartnerDocumentDto } from './dto/partner-onboarding.dto';
import { InternalPartnerOnboardingAdminService } from './internal-partner-onboarding-admin.service';

const internalDocumentUpload = {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req: any, file: Express.Multer.File, cb: any) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new BadRequestException('Document must be JPEG, PNG, WebP, or PDF'), false);
  },
};

@Controller('admin/partner-onboarding/internal-applications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class InternalPartnerOnboardingAdminController {
  constructor(private readonly internal: InternalPartnerOnboardingAdminService) {}

  @Post()
  create(@Req() req: any, @Body() dto: AdminCreateInternalPartnerDto) {
    return this.internal.create(req.user.id, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: AdminUpdateInternalPartnerDto,
  ) {
    return this.internal.update(id, req.user.id, dto);
  }

  @Post(':id/documents')
  @UseInterceptors(FileInterceptor('file', internalDocumentUpload))
  uploadDocument(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: UploadPartnerDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.internal.uploadDocument(id, req.user.id, dto, file);
  }

  @Delete(':id/documents/:documentId')
  removeDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Req() req: any,
  ) {
    return this.internal.removeDocument(id, documentId, req.user.id);
  }

  @Post(':id/submit-for-review')
  submitForReview(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: AdminSubmitInternalPartnerDto,
  ) {
    return this.internal.submitForReview(id, req.user.id, dto);
  }
}
