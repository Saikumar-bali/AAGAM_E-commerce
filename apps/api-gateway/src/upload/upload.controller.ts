import { BadRequestException, Controller, HttpCode, HttpStatus, Post, UploadedFile, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@aagam/database';

const imageUploadOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req: any, file: Express.Multer.File, cb: any) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestException('Invalid file type'), false);
    }
  },
};

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
}
