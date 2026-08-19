import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@aagam/database';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateServiceableLocalityDto } from './dto/create-locality.dto';
import { UpdateServiceableLocalityDto } from './dto/update-locality.dto';
import { AdminListLocalitiesQueryDto } from './dto/list-localities-query.dto';
import { LocalitiesService } from './localities.service';

@Controller('admin/localities')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminLocalitiesController {
  constructor(private readonly localitiesService: LocalitiesService) {}

  @Get()
  listAll(@Query() query: AdminListLocalitiesQueryDto) {
    return this.localitiesService.listAll(query);
  }

  @Post()
  create(@Body() dto: CreateServiceableLocalityDto) {
    return this.localitiesService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateServiceableLocalityDto) {
    return this.localitiesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.localitiesService.remove(id);
  }
}