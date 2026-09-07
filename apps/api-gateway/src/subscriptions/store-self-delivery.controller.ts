import { Controller, Get, Param, Post, Body, Req, UseGuards } from '@nestjs/common';
import { Role } from '@aagam/database';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { StoreSelfDeliveryService } from './store-self-delivery.service';
import { StoreDeliveryCompleteDto, StoreDeliveryFailureDto } from './subscriptions.dto';

type AuthenticatedRequest = { user: { id: string; role: Role; storeId?: string } };

@Controller('store-self-delivery')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STORE_OWNER, Role.ADMIN)
export class StoreSelfDeliveryController {
  constructor(private readonly storeDelivery: StoreSelfDeliveryService) {}

  @Get('queue/:storeId')
  getTodayQueue(@Param('storeId') storeId: string) {
    return this.storeDelivery.getTodayQueue(storeId);
  }

  @Get('customer-info/:subscriptionDeliveryId')
  getCustomerInfo(@Param('subscriptionDeliveryId') subscriptionDeliveryId: string) {
    return this.storeDelivery.getCustomerInfoForVerification(subscriptionDeliveryId);
  }

  @Post('start/:subscriptionDeliveryId')
  startDelivery(@Param('subscriptionDeliveryId') subscriptionDeliveryId: string, @Req() req: AuthenticatedRequest) {
    return this.storeDelivery.startDelivery(subscriptionDeliveryId, req.user.id);
  }

  @Post('complete/:subscriptionDeliveryId')
  completeDelivery(
    @Param('subscriptionDeliveryId') subscriptionDeliveryId: string,
    @Body() body: StoreDeliveryCompleteDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.storeDelivery.verifyAndCompleteDelivery(subscriptionDeliveryId, req.user.id, body);
  }

  @Post('fail/:subscriptionDeliveryId')
  recordFailure(
    @Param('subscriptionDeliveryId') subscriptionDeliveryId: string,
    @Body() body: StoreDeliveryFailureDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.storeDelivery.recordDeliveryFailure(subscriptionDeliveryId, req.user.id, body.reason);
  }
}
