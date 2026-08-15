import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import {
  ActivatePartnerAccountDto,
  CreatePartnerApplicationDto,
  RequestPartnerVerificationDto,
  UpdatePartnerApplicationDto,
  UploadPartnerDocumentDto,
  VerifyPartnerContactDto,
  VerifyPartnerPnvDto,
} from './dto/partner-onboarding.dto';
import { PartnerOnboardingService } from './partner-onboarding.service';
import { PartnerVerificationService } from './partner-verification.service';
import { PartnerContactChannel } from './partner-onboarding.types';

const applicationDocumentUpload = {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req: any, file: Express.Multer.File, cb: any) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new BadRequestException('Document must be JPEG, PNG, WebP, or PDF'), false);
  },
};

@Controller('partner-onboarding')
@UseGuards(ThrottlerGuard)
export class PartnerOnboardingController {
  constructor(
    private readonly onboarding: PartnerOnboardingService,
    private readonly verification: PartnerVerificationService,
  ) {}

  private applicationToken(req: any): string {
    const header = String(req.headers?.authorization || '');
    if (!header.startsWith('Application ')) {
      throw new UnauthorizedException('Application access could not be verified');
    }
    return header.slice('Application '.length).trim();
  }

  private async applicationForVerification(id: string, token: string) {
    const response = await this.onboarding.getApplication(id, token);
    return response?.application;
  }

  @Get('verification-capabilities')
  capabilities() {
    return this.verification.capabilities();
  }

  @Post('applications')
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  create(@Body() dto: CreatePartnerApplicationDto) {
    const email = dto.email?.trim().toLowerCase();
    if (!email) {
      throw new BadRequestException('Email is required for Partner onboarding verification');
    }
    return this.onboarding.createApplication({
      ...dto,
      email,
      verificationChannel: PartnerContactChannel.EMAIL,
    });
  }

  @Post('applications/:id/contact-code')
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  async requestVerification(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: RequestPartnerVerificationDto,
  ) {
    const token = this.applicationToken(req);
    const application = await this.applicationForVerification(id, token);
    if (
      application?.verificationChannel !== PartnerContactChannel.PHONE &&
      dto.channel === PartnerContactChannel.PHONE
    ) {
      throw new BadRequestException('Email verification is mandatory for new Partner applications');
    }
    return this.verification.requestContactCode(
      id,
      token,
      dto.channel,
      dto.fallbackFrom === 'FIREBASE_PNV',
    );
  }

  @Post('applications/:id/verify-contact')
  @Throttle({ short: { limit: 8, ttl: 60000 } })
  verifyContact(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: VerifyPartnerContactDto,
  ) {
    return this.verification.verifyContact(id, this.applicationToken(req), dto.code);
  }

  @Post('applications/:id/phone-pnv/challenge')
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  async phonePnvChallenge(@Param('id') id: string, @Req() req: any) {
    const token = this.applicationToken(req);
    const application = await this.applicationForVerification(id, token);
    if (application?.verificationChannel !== PartnerContactChannel.PHONE) {
      throw new BadRequestException('Email verification is mandatory for this Partner application');
    }
    return this.verification.createPnvChallenge(id, token);
  }

  @Post('applications/:id/phone-pnv/verify')
  @Throttle({ short: { limit: 8, ttl: 60000 } })
  async phonePnvVerify(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: VerifyPartnerPnvDto,
  ) {
    const token = this.applicationToken(req);
    const application = await this.applicationForVerification(id, token);
    if (application?.verificationChannel !== PartnerContactChannel.PHONE) {
      throw new BadRequestException('Email verification is mandatory for this Partner application');
    }
    return this.verification.verifyPnv(id, token, dto.token);
  }

  @Get('applications/:id')
  getApplication(@Param('id') id: string, @Req() req: any) {
    return this.onboarding.getApplication(id, this.applicationToken(req));
  }

  @Patch('applications/:id')
  updateApplication(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: UpdatePartnerApplicationDto,
  ) {
    return this.onboarding.updateApplication(id, this.applicationToken(req), dto);
  }

  @Post('applications/:id/documents')
  @UseInterceptors(FileInterceptor('file', applicationDocumentUpload))
  uploadDocument(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: UploadPartnerDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.onboarding.uploadDocument(id, this.applicationToken(req), dto, file);
  }

  @Delete('applications/:id/documents/:documentId')
  removeDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Req() req: any,
  ) {
    return this.onboarding.removeDocument(id, documentId, this.applicationToken(req));
  }

  @Get('applications/:id/documents/:documentId/url')
  documentUrl(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Req() req: any,
  ) {
    return this.onboarding.documentUrl(id, documentId, this.applicationToken(req));
  }

  @Post('applications/:id/submit')
  async submit(
    @Param('id') id: string,
    @Req() req: any,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    const token = this.applicationToken(req);
    const application = await this.applicationForVerification(id, token);
    if (
      application?.verificationChannel === PartnerContactChannel.EMAIL &&
      !application?.emailVerifiedAt
    ) {
      throw new BadRequestException('Verify your email before submitting the Partner application');
    }
    return this.onboarding.submitApplication(id, token, idempotencyKey);
  }

  @Post('applications/:id/withdraw')
  withdraw(@Param('id') id: string, @Req() req: any) {
    return this.onboarding.withdrawApplication(id, this.applicationToken(req));
  }

  @Get('applications/:id/events')
  events(@Param('id') id: string, @Req() req: any) {
    return this.onboarding.events(id, this.applicationToken(req));
  }

  @Post('applications/:id/activation')
  claimActivation(@Param('id') id: string, @Req() req: any) {
    return this.onboarding.claimActivation(id, this.applicationToken(req));
  }

  @Post('activate')
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  activate(@Body() dto: ActivatePartnerAccountDto) {
    return this.onboarding.activateAccount(dto);
  }
}
