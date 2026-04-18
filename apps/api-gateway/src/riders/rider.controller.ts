import { Controller, Get, Post, Body, UseGuards, Param, Patch } from '@nestjs/common';
import { RiderService } from './rider.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@aagam/database';

@Controller('riders')
export class RiderController {
  constructor(private readonly riderService: RiderService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async findAll() {
    return this.riderService.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string) {
    return this.riderService.findOne(id);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard)
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: any
  ) {
    return this.riderService.updateStatus(id, status);
  }
}
