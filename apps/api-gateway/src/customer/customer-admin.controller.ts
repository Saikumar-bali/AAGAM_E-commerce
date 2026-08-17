import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@aagam/database';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CustomerAdminService } from './customer-admin.service';

@Controller('admin/customers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class CustomerAdminController {
  constructor(private readonly customerAdminService: CustomerAdminService) {}

  @Get()
  async list() {
    return this.customerAdminService.listCustomers();
  }
}
