import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Role } from '@aagam/database';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CustomerService } from './customer.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Controller('customer/addresses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER)
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get()
  async list(@Req() req: Request) {
    // JwtStrategy.validate() returns { id, email, role }
    const userId = (req as any).user?.id as string;
    return this.customerService.listAddresses(userId);
  }

  @Post()
  async create(@Req() req: Request, @Body() dto: CreateAddressDto) {
    const userId = (req as any).user?.id as string;
    return this.customerService.createAddress(userId, dto);
  }

  @Patch(':id')
  async update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateAddressDto) {
    const userId = (req as any).user?.id as string;
    return this.customerService.updateAddress(userId, id, dto);
  }

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    const userId = (req as any).user?.id as string;
    return this.customerService.deleteAddress(userId, id);
  }
}

