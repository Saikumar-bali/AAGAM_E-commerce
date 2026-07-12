import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Role } from '@aagam/database';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RiderLocationDto } from './dto/rider-location.dto';
import { TrackingService } from './tracking.service';

@Controller('tracking')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Get('order/:orderId')
  @Roles(Role.ADMIN, Role.RIDER, Role.STORE_OWNER)
  async getOrderTracking(@Param('orderId') orderId: string, @Req() req: any) {
    return this.trackingService.getOrderTracking(orderId, req.user);
  }

  @Get('my/order/:orderId')
  @Roles(Role.CUSTOMER)
  async getMyOrderTracking(@Param('orderId') orderId: string, @Req() req: any) {
    return this.trackingService.getMyOrderTracking(orderId, req.user.id);
  }

  @Get('admin/live')
  @Roles(Role.ADMIN)
  async getAdminLiveTracking() {
    return this.trackingService.getAdminLiveTracking();
  }

  @Post('rider-location')
  @Roles(Role.RIDER)
  async ingestRiderLocation(@Req() req: any, @Body() dto: RiderLocationDto) {
    return this.trackingService.ingestRiderLocation(req.user.id, dto);
  }

  @Post('start/:orderId')
  @Roles(Role.RIDER)
  async startTracking(@Param('orderId') orderId: string, @Req() req: any) {
    return this.trackingService.startTracking(orderId, req.user);
  }

  @Post('stop/:orderId')
  @Roles(Role.RIDER)
  async stopTracking(
    @Param('orderId') orderId: string,
    @Req() req: any,
    @Body() body?: { reason?: string },
  ) {
    const reason = typeof body?.reason === 'string'
      ? body.reason.trim().slice(0, 120) || 'CLIENT_STOPPED'
      : 'CLIENT_STOPPED';
    return this.trackingService.stopTracking(orderId, req.user, reason);
  }
}
