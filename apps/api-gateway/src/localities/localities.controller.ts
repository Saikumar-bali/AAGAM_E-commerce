import { Controller, Get, Query } from '@nestjs/common';

import { ListLocalitiesQueryDto } from './dto/list-localities-query.dto';
import { LocalitiesService } from './localities.service';

@Controller('localities')
export class LocalitiesController {
  constructor(private readonly localitiesService: LocalitiesService) {}

  @Get()
  listActive(@Query() query: ListLocalitiesQueryDto) {
    return this.localitiesService.listActive(query);
  }
}