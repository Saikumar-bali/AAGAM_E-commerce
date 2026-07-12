import { Controller, Get, Post, Body, UseGuards, Param, Patch, Delete, Req } from '@nestjs/common';
import { StoreService } from './store.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@aagam/database';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';

@Controller('stores')
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Get()
  async findAll() {
    return this.storeService.findAll();
  }

  @Get('my-stores')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STORE_OWNER)
  async findMyStores(@Req() req: any) {
    return this.storeService.findByOwnerId(req.user.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.storeService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async create(@Body() data: CreateStoreDto) {
    return this.storeService.create(data);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async update(@Param('id') id: string, @Body() data: UpdateStoreDto) {
    return this.storeService.update(id, data);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async delete(@Param('id') id: string) {
    return this.storeService.delete(id);
  }

  @Patch(':id/inventory')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STORE_OWNER)
  async updateInventory(
    @Param('id') storeId: string,
    @Body('productId') productId: string,
    @Body('quantity') quantity: number,
    @Req() req: any,
  ) {
    return this.storeService.updateInventory(storeId, productId, quantity, req.user);
  }
}
