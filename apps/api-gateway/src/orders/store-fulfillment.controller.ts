import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { Role } from '@aagam/database';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { StoreFulfillmentService } from './store-fulfillment.service';

@Controller('orders/store')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STORE_OWNER)
export class StoreFulfillmentController {
  constructor(private readonly service: StoreFulfillmentService) {}

  @Patch(':orderId/items/:itemId/unavailable')
  unavailable(@Param('orderId') orderId: string, @Param('itemId') itemId: string, @Body() body: any, @Req() req: any) {
    return this.service.markItemUnavailable(orderId, itemId, req.user.id, body?.reason);
  }

  @Get(':orderId/items/:itemId/substitutes')
  substitutes(@Param('orderId') orderId: string, @Param('itemId') itemId: string, @Req() req: any) {
    return this.service.listSubstitutes(orderId, itemId, req.user.id);
  }

  @Patch(':orderId/items/:itemId/substitute')
  substitute(@Param('orderId') orderId: string, @Param('itemId') itemId: string, @Body() body: any, @Req() req: any) {
    return this.service.substituteItem(orderId, itemId, body.productId, req.user.id);
  }

  @Patch(':orderId/ready')
  ready(@Param('orderId') orderId: string, @Req() req: any) {
    return this.service.readyForPickup(orderId, req.user.id);
  }
}
