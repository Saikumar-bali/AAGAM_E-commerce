import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@aagam/database';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  AdminUpdateRiderStatusDto,
  RiderHeartbeatDto,
  UpdateMyRiderStatusDto,
} from './rider-status.dto';
import { RiderService } from './rider.service';

@Controller('riders')
export class RiderController {
  constructor(private readonly riderService: RiderService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async findAll() {
    return this.riderService.findAll();
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.RIDER)
  async findMe(@Req() req: any) {
    return this.riderService.findByUserId(req.user.id);
  }

  @Patch('me/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.RIDER)
  async updateMyStatus(
    @Req() req: any,
    @Body() data: UpdateMyRiderStatusDto,
  ) {
    return this.riderService.updateStatusForUser(req.user.id, data);
  }

  @Post('me/heartbeat')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.RIDER)
  async heartbeat(@Req() req: any, @Body() data: RiderHeartbeatDto) {
    return this.riderService.updateStatusForUser(req.user.id, {
      status: 'ONLINE',
      heartbeat: true,
      latitude: data.latitude,
      longitude: data.longitude,
    });
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async findOne(@Param('id') id: string) {
    return this.riderService.findOne(id);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async updateStatus(
    @Param('id') id: string,
    @Body() data: AdminUpdateRiderStatusDto,
  ) {
    return this.riderService.updateStatus(id, data);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async create(
    @Body()
    data: {
      email: string;
      name: string;
      phone: string;
      password?: string;
      vehicleType?: string;
      vehicleNumber?: string;
      emergencyContactName?: string;
      emergencyContactPhone?: string;
      latitude?: number;
      longitude?: number;
    },
  ) {
    return this.riderService.create(data);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async delete(@Param('id') id: string) {
    return this.riderService.delete(id);
  }
}
