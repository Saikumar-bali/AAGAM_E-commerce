import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { Role } from '@aagam/database';
import { ProductService } from './product.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('admin/products')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  async findAllForAdmin() {
    return this.productService.findAdminAll();
  }

  @Patch(':id/active')
  async setActive(@Param('id') id: string, @Body('isActive') isActive: boolean) {
    return this.productService.setActive(id, Boolean(isActive));
  }
}
