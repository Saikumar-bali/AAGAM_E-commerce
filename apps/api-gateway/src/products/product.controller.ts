import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductRoutingWeightService } from './product-routing-weight.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@aagam/database';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';

@Controller('products')
export class ProductController {
  constructor(
    private readonly productService: ProductService,
    private readonly routingWeightService: ProductRoutingWeightService,
  ) {}

  @Get()
  async findAll(@Query() query: QueryProductsDto, @Req() req: any) {
    return this.productService.findAll(query, req?.user?.id);
  }

  @Get('categories')
  async getCategories() {
    return this.productService.getCategories();
  }

  @Post('categories')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async createCategory(@Body() data: { name?: string; imageUrl?: string | null }) {
    return this.productService.createCategory(data?.name || '', data?.imageUrl);
  }

  @Patch('categories/reorder')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async reorderCategories(@Body('ids') ids: string[]) {
    return this.productService.reorderCategories(Array.isArray(ids) ? ids : []);
  }

  @Patch('categories/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async updateCategory(@Param('id') id: string, @Body() data: { name?: string; imageUrl?: string | null }) {
    return this.productService.updateCategory(id, data?.name || '', data?.imageUrl);
  }

  @Delete('categories/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async deleteCategory(@Param('id') id: string) {
    return this.productService.deleteCategory(id);
  }

  @Get(':id/substitutes')
  async getSubstitutes(@Param('id') id: string, @Query() query: QueryProductsDto, @Req() req: any) {
    return this.productService.getSubstitutes(id, query, req?.user?.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Query() query: QueryProductsDto, @Req() req: any) {
    return this.productService.findOne(id, query, req?.user?.id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async create(@Body() data: CreateProductDto) {
    const product = await this.productService.create(data);
    return data.weightGrams === undefined
      ? product
      : this.routingWeightService.setWeight(product.id, data.weightGrams);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async update(@Param('id') id: string, @Body() data: UpdateProductDto) {
    const product = await this.productService.update(id, data);
    return data.weightGrams === undefined
      ? product
      : this.routingWeightService.setWeight(product.id, data.weightGrams);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async delete(@Param('id') id: string) {
    return this.productService.delete(id);
  }
}
