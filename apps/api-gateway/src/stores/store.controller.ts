import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { StoreService } from './store.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@aagam/database';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { AddStoreProductDto } from './dto/add-store-product.dto';
import { StoreCatalogQueryDto } from './dto/store-catalog-query.dto';

@Controller('stores')
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Get()
  async findAll() {
    return this.storeService.findAll();
  }

  @Get('delivery-zones')
  async getDeliveryZones() {
    return this.storeService.getDeliveryZones(false);
  }

  @Get('delivery-zones/admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async getAdminDeliveryZones() {
    return this.storeService.getDeliveryZones(true);
  }

  @Post('delivery-zones')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async createDeliveryZone(@Body('name') name: string) {
    return this.storeService.createDeliveryZone(name);
  }

  @Patch('delivery-zones/reorder')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async reorderDeliveryZones(@Body('ids') ids: string[]) {
    return this.storeService.reorderDeliveryZones(Array.isArray(ids) ? ids : []);
  }

  @Patch('delivery-zones/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async updateDeliveryZone(@Param('id') id: string, @Body() body: { name?: string; isActive?: boolean }) {
    return this.storeService.updateDeliveryZone(id, body);
  }

  @Get('my-stores')
  @Get('mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STORE_OWNER)
  async findMyStores(@Req() req: any) {
    return this.storeService.findByOwnerId(req.user.id);
  }

  @Get(':id/assortment')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STORE_OWNER, Role.ADMIN)
  async getStoreAssortment(@Param('id') storeId: string, @Req() req: any) {
    return this.storeService.getStoreAssortment(storeId, req.user);
  }

  @Get(':id/catalog')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STORE_OWNER, Role.ADMIN)
  async getAvailableCatalogue(
    @Param('id') storeId: string,
    @Query() query: StoreCatalogQueryDto,
    @Req() req: any,
  ) {
    return this.storeService.getAvailableCatalogue(storeId, req.user, query);
  }

  @Post(':id/assortment')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STORE_OWNER)
  async addStoreProduct(
    @Param('id') storeId: string,
    @Body() data: AddStoreProductDto,
    @Req() req: any,
  ) {
    return this.storeService.addStoreProduct(storeId, data, req.user);
  }

  @Get(':id/orders')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STORE_OWNER, Role.ADMIN)
  async getStoreOrders(@Param('id') id: string, @Req() req: any) {
    return this.storeService.getStoreOrders(id, req.user);
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
    @Body('isListed') isListed: boolean | undefined,
    @Body('autoHideWhenOutOfStock') autoHideWhenOutOfStock: boolean | undefined,
    @Body('sellingPrice') sellingPrice: number | null | undefined,
    @Req() req: any,
  ) {
    return this.storeService.updateInventory(
      storeId,
      productId,
      quantity,
      req.user,
      { isListed, autoHideWhenOutOfStock, sellingPrice },
    );
  }
}
