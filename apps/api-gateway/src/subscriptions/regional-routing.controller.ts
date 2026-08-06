import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@aagam/database';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RegionalDeliveryZoneService } from './regional-delivery-zone.service';
import { RegionalRouteOperationsService } from './regional-route-operations.service';
import { RegionalRoutePlanningService } from './regional-route-planning.service';
import {
  CancelRegionalRunDto,
  InterruptDeliveryRunDto,
  MergeDeliveryRunsDto,
  MoveRunStopDto,
  PlanRegionalRoutesDto,
  PreviewRouteSplitDto,
  ReassignRegionalRunDto,
  ReorderRegionalRunDto,
  SplitDeliveryRunDto,
  UpsertRegionalDeliveryZoneDto,
} from './regional-routing.dto';

type AuthenticatedRequest = { user: { id: string; role: Role } };

@Controller('admin/subscriptions/regional-routing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminRegionalRoutingController {
  constructor(
    private readonly zones: RegionalDeliveryZoneService,
    private readonly planner: RegionalRoutePlanningService,
    private readonly operations: RegionalRouteOperationsService,
  ) {}

  @Get('dashboard')
  dashboard(@Query('date') date?: string) {
    return this.operations.dashboard(date);
  }

  @Get('events')
  events(@Query('after') after?: string) {
    return this.operations.events(after);
  }

  @Get('zones')
  listZones() {
    return this.zones.list();
  }

  @Get('zones/:id')
  zone(@Param('id') id: string) {
    return this.zones.one(id);
  }

  @Post('zones')
  createZone(@Body() body: UpsertRegionalDeliveryZoneDto) {
    return this.zones.upsert(undefined, body);
  }

  @Patch('zones/:id')
  updateZone(@Param('id') id: string, @Body() body: UpsertRegionalDeliveryZoneDto) {
    return this.zones.upsert(id, body);
  }

  @Post('plan')
  plan(@Body() body: PlanRegionalRoutesDto) {
    return this.planner.planGeneratedDeliveries(body.limit ?? 1000, {
      serviceDate: body.serviceDate ? new Date(body.serviceDate) : undefined,
      assignRiders: body.assignRiders ?? true,
    });
  }

  @Post('runs/:runId/split-preview')
  previewSplit(@Param('runId') runId: string, @Body() body: PreviewRouteSplitDto) {
    return this.operations.previewSplit(runId, body);
  }

  @Post('runs/:runId/split')
  split(
    @Param('runId') runId: string,
    @Body() body: SplitDeliveryRunDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.operations.split(runId, body, request.user);
  }

  @Post('runs/:runId/merge')
  merge(
    @Param('runId') runId: string,
    @Body() body: MergeDeliveryRunsDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.operations.merge(runId, body, request.user);
  }

  @Post('runs/:runId/stops/:stopId/move')
  moveStop(
    @Param('runId') runId: string,
    @Param('stopId') stopId: string,
    @Body() body: MoveRunStopDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.operations.moveStop(runId, stopId, body, request.user);
  }

  @Post('runs/:runId/reassign')
  reassign(
    @Param('runId') runId: string,
    @Body() body: ReassignRegionalRunDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.operations.reassign(runId, body, request.user);
  }

  @Post('runs/:runId/reorder')
  reorder(
    @Param('runId') runId: string,
    @Body() body: ReorderRegionalRunDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.operations.reorder(runId, body, request.user);
  }

  @Post('runs/:runId/cancel')
  cancel(
    @Param('runId') runId: string,
    @Body() body: CancelRegionalRunDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.operations.cancel(runId, body, request.user);
  }

  @Post('runs/:runId/interrupt')
  interrupt(
    @Param('runId') runId: string,
    @Body() body: InterruptDeliveryRunDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.operations.interruptAndRecover(runId, body, request.user);
  }
}

@Controller('regional-routing/events')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.RIDER, Role.STORE_OWNER)
export class RegionalRoutingEventsController {
  constructor(private readonly operations: RegionalRouteOperationsService) {}

  @Get()
  list(
    @Query('after') after: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.operations.events(after, request.user);
  }
}
