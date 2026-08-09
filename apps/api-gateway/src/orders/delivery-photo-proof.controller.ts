import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Role } from '@aagam/database';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DeliveryPhotoProofService } from './delivery-photo-proof.service';

const photoUploadOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req: any, file: Express.Multer.File, cb: any) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new BadRequestException('Delivery proof must be a JPG, PNG, or WebP photo'), false);
  },
};

function requiredNumber(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new BadRequestException(`${field} is required`);
  return number;
}

@Controller('orders/delivery-photo-proof')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DeliveryPhotoProofController {
  constructor(private readonly photoProof: DeliveryPhotoProofService) {}

  @Post('jobs/:deliveryJobId/complete')
  @Roles(Role.RIDER)
  @UseInterceptors(FileInterceptor('file', photoUploadOptions))
  complete(
    @Param('deliveryJobId') deliveryJobId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: Record<string, string>,
    @Req() req: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.photoProof.completeWithPhoto(
      deliveryJobId,
      { id: req.user.id, role: Role.RIDER },
      file,
      {
        riderConfirmed: body.riderConfirmed === 'true' || body.riderConfirmed === '1',
        note: body.note?.trim() || undefined,
        latitude: requiredNumber(body.latitude, 'latitude'),
        longitude: requiredNumber(body.longitude, 'longitude'),
        accuracyMetres: body.accuracyMetres == null || body.accuracyMetres === ''
          ? undefined
          : requiredNumber(body.accuracyMetres, 'accuracyMetres'),
      },
      idempotencyKey,
    );
  }
}
