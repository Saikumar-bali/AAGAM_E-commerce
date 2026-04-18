import { Controller, Get, Post, Body, UseGuards, Param, Patch } from '@nestjs/common';
import { StoreService } from './store.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@aagam/database';

@Controller('stores')
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Get()
  async findAll() {
    return this.storeService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.storeService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async create(@Body() data: any) {
    return this.storeService.create(data);
  }

  @Patch(':id/inventory')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STORE_OWNER)
  async updateInventory(
    @Param('id') storeId: string,
    @Body('productId') productId: string,
    @Body('quantity') quantity: number,
  ) {
    return this.storeService.updateInventory(storeId, productId, quantity);
  }
}
