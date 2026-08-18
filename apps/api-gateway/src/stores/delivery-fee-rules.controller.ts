import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@aagam/database';
import { DeliveryFeeRulesService } from './delivery-fee-rules.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateDeliveryFeeRuleDto, MatchTestDeliveryFeeRuleDto, UpdateDeliveryFeeRuleDto } from './dto/delivery-fee-rule.dto';

@Controller('admin/delivery-fee-rules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class DeliveryFeeRulesController {
  constructor(private readonly rulesService: DeliveryFeeRulesService) {}

  @Get()
  listAll() {
    return this.rulesService.listAll();
  }

  @Post()
  create(@Body() dto: CreateDeliveryFeeRuleDto) {
    return this.rulesService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDeliveryFeeRuleDto) {
    return this.rulesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.rulesService.remove(id);
  }

  @Post('match-test')
  matchTest(@Body() dto: MatchTestDeliveryFeeRuleDto) {
    return this.rulesService.matchTest(dto);
  }
}
