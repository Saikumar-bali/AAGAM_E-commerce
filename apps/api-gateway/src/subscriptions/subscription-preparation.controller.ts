import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Role } from '@aagam/database';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { StoreStockReadinessDto, UpdateSubscriptionPreparationPolicyDto } from './subscription-preparation.dto';
import { SubscriptionPreparationService } from './subscription-preparation.service';

type AuthenticatedRequest = { user: { id: string; role: Role } };

@Controller('store/subscription-preparation')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STORE_OWNER, Role.ADMIN)
export class StoreSubscriptionPreparationController {
  constructor(private readonly preparation: SubscriptionPreparationService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest, @Query('days') days?: string) {
    return this.preparation.list(request.user, Number(days || 3));
  }

  @Post('deliveries/:deliveryId/readiness')
  readiness(
    @Param('deliveryId') deliveryId: string,
    @Body() body: StoreStockReadinessDto,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.preparation.setReadiness(request.user, deliveryId, body.decision, body.note, idempotencyKey);
  }
}

@Controller('admin/subscriptions/preparation')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminSubscriptionPreparationController {
  constructor(private readonly preparation: SubscriptionPreparationService) {}

  @Get()
  overview(@Query('days') days?: string) {
    return this.preparation.adminOverview(Number(days || 3));
  }

  @Patch('plans/:planId/policy')
  policy(
    @Param('planId') planId: string,
    @Body() body: UpdateSubscriptionPreparationPolicyDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.preparation.updatePlanPolicy(request.user, planId, body);
  }
}
