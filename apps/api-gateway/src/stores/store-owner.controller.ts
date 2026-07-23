import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { Role } from '@aagam/database';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UpdateOwnedStoreProfileDto } from './dto/update-owned-store-profile.dto';
import { StoreOwnerService } from './store-owner.service';

@Controller('store-owner')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STORE_OWNER)
export class StoreOwnerController {
  constructor(private readonly storeOwnerService: StoreOwnerService) {}

  @Get('stores')
  async listStores(@Req() req: any) {
    return this.storeOwnerService.listDashboardStores(req.user.id);
  }

  @Patch('stores/:id/profile')
  async updateStoreProfile(
    @Param('id') storeId: string,
    @Body() data: UpdateOwnedStoreProfileDto,
    @Req() req: any,
  ) {
    return this.storeOwnerService.updateOwnedProfile(storeId, req.user.id, data);
  }
}
