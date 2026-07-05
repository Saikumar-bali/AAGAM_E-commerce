import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Role } from '@aagam/database';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PostDeliveryService } from './post-delivery.service';

@Controller('orders/post-delivery')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PostDeliveryController {
  constructor(private readonly postDelivery: PostDeliveryService) {}

  @Get('support')
  @Roles(Role.ADMIN)
  supportQueue(@Req() req: any) {
    return this.postDelivery.adminSupportQueue(req.user);
  }

  @Get(':orderId')
  @Roles(Role.CUSTOMER)
  myPostDelivery(@Param('orderId') orderId: string, @Req() req: any) {
    return this.postDelivery.listMyPostDelivery(orderId, req.user.id);
  }

  @Post(':orderId/rating')
  @Roles(Role.CUSTOMER)
  rateOrder(
    @Param('orderId') orderId: string,
    @Body() body: { orderRating: number; storeRating?: number; riderRating?: number; comment?: string },
    @Req() req: any,
  ) {
    return this.postDelivery.submitRating(orderId, req.user.id, body);
  }

  @Post(':orderId/support')
  @Roles(Role.CUSTOMER)
  createSupport(
    @Param('orderId') orderId: string,
    @Body() body: { category: string; message: string; priority?: 'LOW' | 'NORMAL' | 'HIGH'; requestedRefund?: boolean },
    @Req() req: any,
  ) {
    return this.postDelivery.createSupportTicket(orderId, req.user.id, body);
  }
}
