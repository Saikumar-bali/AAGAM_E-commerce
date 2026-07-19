import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { hasUserRole } from '../auth/user-roles';
import { prisma, Role } from '@aagam/database';

const imageUploadOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req: any, file: Express.Multer.File, cb: any) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new BadRequestException('Invalid file type'), false);
  },
};

const evidenceUploadOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req: any, file: Express.Multer.File, cb: any) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new BadRequestException('Evidence must be JPEG, PNG, WebP, or PDF'), false);
  },
};

function validPrivateKey(storageKey: string) {
  if (!storageKey || storageKey.includes('..') || storageKey.startsWith('/')) return false;
  return /^(evidence|partner-applications|riders|stores)\/[A-Za-z0-9._/-]{3,1000}$/.test(storageKey);
}

@Controller('upload')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UploadController {
  constructor(private uploadService: UploadService) {}

  @Post('image')
  @Roles(Role.ADMIN, Role.STORE_OWNER)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.uploadService.uploadImage(file.buffer, file.originalname);
  }

  @Post('images')
  @Roles(Role.ADMIN, Role.STORE_OWNER)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FilesInterceptor('files', 50, imageUploadOptions))
  async uploadImages(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files?.length) throw new BadRequestException('No files uploaded');
    return this.uploadService.uploadImages(files);
  }

  @Post('evidence')
  @Roles(Role.RIDER, Role.ADMIN, Role.STORE_OWNER)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', evidenceUploadOptions))
  async uploadEvidence(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
    if (!file) throw new BadRequestException('No evidence file uploaded');
    return this.uploadService.uploadEvidence(file, req.user.id);
  }

  @Get('evidence-url')
  @Roles(Role.RIDER, Role.ADMIN, Role.STORE_OWNER)
  async evidenceUrl(@Query('key') storageKey: string, @Req() req: any) {
    if (!validPrivateKey(storageKey)) throw new BadRequestException('Invalid evidence key');
    let authorized = hasUserRole(req.user, Role.ADMIN) || storageKey.startsWith(`evidence/${req.user.id}/`);
    if (!authorized && hasUserRole(req.user, Role.RIDER)) {
      const rider = await prisma.riderProfile.findUnique({
        where: { userId: req.user.id },
        select: { id: true },
      });
      if (rider) {
        const [document, tickets] = await Promise.all([
          prisma.riderDocument.findFirst({
            where: { riderProfileId: rider.id, storageKey },
            select: { id: true },
          }),
          prisma.riderSupportTicket.findMany({
            where: { riderProfileId: rider.id },
            select: {
              evidenceKeys: true,
              messages: { select: { evidenceKeys: true } },
            },
          }),
        ]);
        authorized =
          Boolean(document) ||
          tickets.some((ticket: any) => {
            const ticketKeys = Array.isArray(ticket.evidenceKeys) ? ticket.evidenceKeys : [];
            const messageKeys = ticket.messages.flatMap((message: any) =>
              Array.isArray(message.evidenceKeys) ? message.evidenceKeys : [],
            );
            return [...ticketKeys, ...messageKeys].includes(storageKey);
          });
      }
    }
    if (!authorized) throw new ForbiddenException('Evidence does not belong to this account');
    return this.uploadService.signedEvidenceUrl(storageKey, { disposition: 'inline' });
  }
}
