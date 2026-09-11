import { Controller, Get, Param, Post, Patch, Body, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { Role } from '@aagam/database';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { StoreSelfDeliveryService } from './store-self-delivery.service';
import { StoreDeliveryCompleteDto, StoreDeliveryFailureDto } from './subscriptions.dto';
import { prisma } from '@aagam/database';

type AuthenticatedRequest = { user: { id: string; role: Role; storeId?: string } };

@Controller('store-self-delivery')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STORE_OWNER, Role.ADMIN)
export class StoreSelfDeliveryController {
  constructor(private readonly storeDelivery: StoreSelfDeliveryService) {}

  private async assertStoreOwnership(storeId: string, user: { id: string; role: Role }) {
    if (user.role === Role.ADMIN) return;
    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { ownerId: true } });
    if (!store || store.ownerId !== user.id) throw new ForbiddenException('You do not have access to this store');
  }

  @Get('queue/:storeId')
  async getTodayQueue(@Param('storeId') storeId: string, @Req() req: AuthenticatedRequest) {
    await this.assertStoreOwnership(storeId, req.user);
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

  @Patch('update/:subscriptionDeliveryId')
  updateDelivery(
    @Param('subscriptionDeliveryId') subscriptionDeliveryId: string,
    @Body() body: { status?: 'DELIVERED' | 'FAILED'; cashCollectedPaise?: number; notes?: string; failureReason?: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.storeDelivery.updateDelivery(subscriptionDeliveryId, req.user.id, body);
  }
}
