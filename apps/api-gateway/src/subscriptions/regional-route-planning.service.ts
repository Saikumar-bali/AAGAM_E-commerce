/**
 * Regional route planning facade.
 *
 * Split out of the former regional-route-planning.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { Injectable } from '@nestjs/common';
import { RegionalDeliveryZoneService } from './regional-delivery-zone.service';
import { DeliveryWorkflowService } from '../orders/delivery-workflow.service';
import { SubscriptionCalendarService } from './subscription-calendar.service';
import { RegionalRouteAssignmentService } from './regional-route-assignment.service';
import { RegionalRoutePlanningInventoryService } from './regional-route-planning.inventory.service';
import { RegionalRouteActor, RiderScore } from './regional-route-planning.shared';

export { RegionalRouteActor, RiderScore } from './regional-route-planning.shared';
import { Prisma } from '@aagam/database';
import { RouteAssignmentSource } from '@aagam/database';

@Injectable()
export class RegionalRoutePlanningService {
  private readonly assignment: RegionalRouteAssignmentService;
  private readonly planning: RegionalRoutePlanningInventoryService;

  constructor(
    zones: RegionalDeliveryZoneService,
    workflow: DeliveryWorkflowService,
    calendar: SubscriptionCalendarService,
  ) {
    this.assignment = new RegionalRouteAssignmentService(workflow);
    this.planning = new RegionalRoutePlanningInventoryService(zones, calendar, this.assignment);
  }

  async planGeneratedDeliveries(limit = 1000, options?: { serviceDate?: Date; assignRiders?: boolean }) {
    return this.planning.planGeneratedDeliveries(limit, options);
  }

  async rankEligibleRiders(runId: string): Promise<RiderScore[]> {
    return this.assignment.rankEligibleRiders(runId);
  }

  async assignBestEligibleRider(runId: string) {
    return this.assignment.assignBestEligibleRider(runId);
  }

  async validateRiderForRunWithinTransaction(
    tx: Prisma.TransactionClient,
    runId: string,
    riderId: string,
  ): Promise<RiderScore> {
    return this.assignment.validateRiderForRunWithinTransaction(tx, runId, riderId);
  }

  async assignRiderWithinTransaction(
    tx: Prisma.TransactionClient,
    runId: string,
    riderId: string,
    actor: RegionalRouteActor,
    source: RouteAssignmentSource,
    reasonPrefix?: string,
  ) {
    return this.assignment.assignRiderWithinTransaction(tx, runId, riderId, actor, source, reasonPrefix);
  }

  async assignRider(
    runId: string,
    selected: RiderScore,
    actor: RegionalRouteActor,
    source: RouteAssignmentSource,
  ) {
    return this.assignment.assignRider(runId, selected, actor, source);
  }
}
