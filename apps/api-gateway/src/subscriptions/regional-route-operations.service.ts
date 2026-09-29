/**
 * Regional route operations facade.
 *
 * Split out of the former regional-route-operations.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { Injectable } from '@nestjs/common';
import { CancelRegionalRunDto, InterruptDeliveryRunDto, MergeDeliveryRunsDto, MoveRunStopDto, PreviewRouteSplitDto, ReassignRegionalRunDto, ReorderRegionalRunDto, SplitDeliveryRunDto } from './regional-routing.dto';
import { Actor } from './regional-route-operations.service.base';
import { RegionalRoutePlanningService } from './regional-route-planning.service';
import { RegionalRouteMutationService } from './regional-route-operations.mutation.service';
import { RegionalRouteQueryService } from './regional-route-operations.query.service';

@Injectable()
export class RegionalRouteOperationsService {
  private readonly mutation: RegionalRouteMutationService;
  private readonly query: RegionalRouteQueryService;

  constructor(planner: RegionalRoutePlanningService) {
    this.mutation = new RegionalRouteMutationService(planner);
    this.query = new RegionalRouteQueryService();
  }

  async previewSplit(runId: string, dto: PreviewRouteSplitDto) {
    return this.mutation.previewSplit(runId, dto);
  }

  async split(runId: string, dto: SplitDeliveryRunDto, actor: Actor) {
    return this.mutation.split(runId, dto, actor);
  }

  async merge(targetRunId: string, dto: MergeDeliveryRunsDto, actor: Actor) {
    return this.mutation.merge(targetRunId, dto, actor);
  }

  async moveStop(sourceRunId: string, stopId: string, dto: MoveRunStopDto, actor: Actor) {
    return this.mutation.moveStop(sourceRunId, stopId, dto, actor);
  }

  async reassign(runId: string, dto: ReassignRegionalRunDto, actor: Actor) {
    return this.mutation.reassign(runId, dto, actor);
  }

  async reorder(runId: string, dto: ReorderRegionalRunDto, actor: Actor) {
    return this.mutation.reorder(runId, dto, actor);
  }

  async cancel(runId: string, dto: CancelRegionalRunDto, actor: Actor) {
    return this.mutation.cancel(runId, dto, actor);
  }

  async interruptAndRecover(runId: string, dto: InterruptDeliveryRunDto, actor: Actor) {
    return this.mutation.interruptAndRecover(runId, dto, actor);
  }

  async dashboard(date?: string) {
    return this.query.dashboard(date);
  }

  async events(after?: string, actor?: Actor) {
    return this.query.events(after, actor);
  }
}
