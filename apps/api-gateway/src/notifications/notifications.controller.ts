import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Role } from '@aagam/database';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { NotificationService } from './notification.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationService) {}

  @Get('inbox')
  @Roles(Role.CUSTOMER, Role.STORE_OWNER, Role.RIDER, Role.ADMIN)
  inbox(@Req() req: any, @Query('limit') limit?: string) {
    return this.notifications.listInbox(req.user, limit);
  }

  @Patch(':sourceHistoryId/read')
  @Roles(Role.CUSTOMER, Role.STORE_OWNER, Role.RIDER, Role.ADMIN)
  markRead(@Param('sourceHistoryId') sourceHistoryId: string, @Req() req: any) {
    return this.notifications.markRead(req.user, sourceHistoryId);
  }

  @Post('admin/broadcast')
  @Roles(Role.ADMIN)
  broadcastPlaceholder(@Req() req: any, @Body() body: { title?: string; body?: string; audience?: string }) {
    return this.notifications.createBroadcastPlaceholder(req.user, body || {});
  }
}
