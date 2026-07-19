import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GlobalSearchService } from './search.service';

@Controller('search')
@UseGuards(JwtAuthGuard)
export class GlobalSearchController {
  constructor(private readonly search: GlobalSearchService) {}

  @Get('global')
  global(@Req() req: any, @Query('q') q?: string) {
    return this.search.search(req.user, String(q || ''));
  }
}
