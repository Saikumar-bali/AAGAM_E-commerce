import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Role } from '@aagam/database';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DispatchService } from './dispatch.service';

@Controller('orders/dispatch')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DispatchController {
  constructor(private readonly dispatch: DispatchService) {}

  @Get('board')
  @Roles(Role.ADMIN, Role.STORE_OWNER)
  board(@Req() req: any) {
    return this.dispatch.getBoard(req.user);
  }

  @Post(':orderId/assign')
  @Roles(Role.ADMIN, Role.STORE_OWNER)
  assign(@Param('orderId') orderId: string, @Body() body: { riderUserId: string }, @Req() req: any) {
    return this.dispatch.assignPackedOrder(orderId, body.riderUserId, req.user);
  }

  @Patch(':orderId/rider/accept')
  @Roles(Role.RIDER)
  accept(@Param('orderId') orderId: string, @Req() req: any) {
    return this.dispatch.acceptAssignment(orderId, req.user.id);
  }

  @Patch(':orderId/rider/reject')
  @Roles(Role.RIDER)
  reject(@Param('orderId') orderId: string, @Body() body: { reason?: string }, @Req() req: any) {
    return this.dispatch.rejectAssignment(orderId, req.user.id, body?.reason);
  }

  @Patch(':orderId/rider/pickup')
  @Roles(Role.RIDER)
  pickup(@Param('orderId') orderId: string, @Req() req: any) {
    return this.dispatch.markPickedUp(orderId, req.user.id);
  }

  @Patch(':orderId/rider/deliver')
  @Roles(Role.RIDER)
  deliver(
    @Param('orderId') orderId: string,
    @Body() body: { proofType?: string; code?: string; note?: string; latitude?: number; longitude?: number },
    @Req() req: any,
  ) {
    return this.dispatch.markDelivered(orderId, req.user.id, body || {});
  }
}
