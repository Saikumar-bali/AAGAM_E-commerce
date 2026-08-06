import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DeliveryRouteEventType,
  DeliveryRunStatus,
  DeliveryRunStopStatus,
  Prisma,
  Role,
  RouteAssignmentSource,
  SubscriptionDeliveryStatus,
  prisma,
} from '@aagam/database';
import { DeliveryJobStatus } from '@aagam/types';
import { createHash } from 'crypto';
import {
  CancelRegionalRunDto,
  InterruptDeliveryRunDto,
  MergeDeliveryRunsDto,
  MoveRunStopDto,
  PreviewRouteSplitDto,
  ReassignRegionalRunDto,
  ReorderRegionalRunDto,
  RouteSplitMethod,
  SplitDeliveryRunDto,
} from './regional-routing.dto';
import {
  GeoPoint,
  RouteCandidate,
  estimateRoute,
  nearestNeighbourOrder,
  splitByOperationalConstraints,
} from './regional-routing.geometry';
import { RegionalRoutePlanningService } from './regional-route-planning.service';

type Actor = { id: string; role: Role };
type Tx = Prisma.TransactionClient;

type EditableRun = Prisma.DeliveryRunGetPayload<{
  include: {
    deliveryZone: true;
    store: true;
    rider: { include: { user: true } };
    stops: { include: { deliveryJob: { include: { codLedger: true } }; subscriptionDelivery: true } };
  };
}>;

const EDITABLE_RUN_STATUSES: DeliveryRunStatus[] = [
  DeliveryRunStatus.PLANNED,
  DeliveryRunStatus.RIDER_NEEDED,
];

function digest(value: string, length = 8) {
  return createHash('sha256').update(value).digest('hex').slice(0, length).toUpperCase();
}

function routeOrigin(run: EditableRun): GeoPoint {
  return { latitude: run.store.latitude, longitude: run.store.longitude };
}

function candidateFromStop(stop: EditableRun['stops'][number]): RouteCandidate<EditableRun['stops'][number]> {
  const latitude = Number(stop.deliveryLatitude);
  const longitude = Number(stop.deliveryLongitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new BadRequestException(`Stop ${stop.sequenceNumber} is missing authoritative delivery coordinates`);
  }
  return {
    id: stop.id,
    latitude,
    longitude,
    parcelCount: stop.expectedParcelCount,
    cashDuePaise: stop.cashDuePaise,
    value: stop,
  };
}

@Injectable()
export class RegionalRouteOperationsService {
  constructor(private readonly planner: RegionalRoutePlanningService) {}

  private async run(id: string): Promise<EditableRun> {
    const run = await prisma.deliveryRun.findUnique({
      where: { id },
      include: {
        deliveryZone: true,
        store: true,
        rider: { include: { user: true } },
        stops: {
          orderBy: { sequenceNumber: 'asc' },
          include: {
            deliveryJob: { include: { codLedger: true } },
            subscriptionDelivery: true,
          },
        },
      },
    });
    if (!run) throw new NotFoundException('Delivery run not found');
    return run;
  }

  private assertVersion(run: EditableRun, version: number) {
    if (run.version !== version) throw new ConflictException('Delivery run changed; refresh and try again');
  }

  private assertEditable(run: EditableRun) {
    if (!EDITABLE_RUN_STATUSES.includes(run.status)) {
      throw new BadRequestException(`Run ${run.routeCode} cannot be changed from ${run.status}`);
    }
    if (run.packingConfirmedAt || run.storeHandoffConfirmedAt || run.pickupConfirmedAt || run.startedAt) {
      throw new BadRequestException('Only unstarted and unpacked routes may be manually reorganised');
    }
    const protectedStop = run.stops.find((stop) =>
      [DeliveryRunStopStatus.ARRIVED, DeliveryRunStopStatus.DELIVERED, DeliveryRunStopStatus.RETURNED].includes(stop.status)
      || Number(stop.deliveryJob.codLedger?.collectedAmountPaise || 0) > 0,
    );
    if (protectedStop) throw new BadRequestException(`Stop ${protectedStop.sequenceNumber} already has protected operational or cash history`);
  }

  private constraints(run: EditableRun, maximumStops?: number) {
    const zone = run.deliveryZone;
    return {
      maximumStops: Math.max(1, maximumStops ?? zone?.maximumStopsPerRun ?? 15),
      maximumParcels: Math.max(1, zone?.maximumParcelCount ?? 50),
      maximumCashPaise: Math.max(0, zone?.cashRiskLimitPaise ?? 1_000_000),
      maximumDistanceKm: Math.max(0.1, zone?.maximumRouteDistanceKm ?? 30),
      maximumDurationMinutes: Math.max(1, zone?.maximumEstimatedDurationMinutes ?? 120),
      averageSpeedKph: Math.max(5, Number(process.env.ROUTE_AVERAGE_SPEED_KPH || 22)),
      serviceMinutesPerStop: Math.max(1, Number(process.env.ROUTE_SERVICE_MINUTES_PER_STOP || 5)),
    };
  }

  private splitCandidates(run: EditableRun, dto: PreviewRouteSplitDto) {
    const candidates = run.stops.map(candidateFromStop);
    if (candidates.length < 2) throw new BadRequestException('A run requires at least two stops before it can be split');
    if (dto.method === RouteSplitMethod.SELECTED_STOPS) {
      const selected = new Set(dto.selectedStopIds ?? []);
      if (!selected.size) throw new BadRequestException('Select at least one stop to move into the new run');
      const left = candidates.filter((item) => !selected.has(item.id));
      const right = candidates.filter((item) => selected.has(item.id));
      if (!left.length || !right.length || right.length !== selected.size) {
        throw new BadRequestException('Selected-stop split must leave at least one valid stop in each run');
      }
      return [nearestNeighbourOrder(routeOrigin(run), left), nearestNeighbourOrder(routeOrigin(run), right)];
    }
    const constraints = this.constraints(
      run,
      dto.method === RouteSplitMethod.MAX_STOPS ? dto.maximumStops : undefined,
    );
    const clusters = splitByOperationalConstraints(routeOrigin(run), candidates, constraints);
    if (clusters.length < 2) {
      const midpoint = Math.ceil(candidates.length / 2);
      return [
        nearestNeighbourOrder(routeOrigin(run), candidates.slice(0, midpoint)),
        nearestNeighbourOrder(routeOrigin(run), candidates.slice(midpoint)),
      ];
    }
    return clusters;
  }

  async previewSplit(runId: string, dto: PreviewRouteSplitDto) {
    const run = await this.run(runId);
    this.assertVersion(run, dto.version);
    this.assertEditable(run);
    const constraints = this.constraints(run, dto.maximumStops);
    const clusters = this.splitCandidates(run, dto);
    return {
      sourceRun: { id: run.id, routeCode: run.routeCode, version: run.version, stopCount: run.stops.length },
      method: dto.method,
      resultingRuns: clusters.map((cluster, index) => {
        const estimate = estimateRoute(routeOrigin(run), cluster, constraints);
        return {
          index: index + 1,
          stopIds: cluster.map((item) => item.id),
          stopCount: cluster.length,
          parcelCount: cluster.reduce((sum, item) => sum + item.parcelCount, 0),
          expectedCashPaise: cluster.reduce((sum, item) => sum + item.cashDuePaise, 0),
          estimatedDistanceKm: estimate.distanceKm,
          estimatedDurationMinutes: estimate.durationMinutes,
        };
      }),
    };
  }

  async split(runId: string, dto: SplitDeliveryRunDto, actor: Actor) {
    const source = await this.run(runId);
    this.assertVersion(source, dto.version);
    this.assertEditable(source);
    const clusters = this.splitCandidates(source, dto);
    const constraints = this.constraints(source, dto.maximumStops);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`manual-route-split:${runId}`}))`);
      const current = await tx.deliveryRun.findUnique({ where: { id: runId } });
      if (!current || current.version !== dto.version) throw new ConflictException('Delivery run changed during split');
      const runIds = [source.id];
      for (let index = 1; index < clusters.length; index += 1) {
        const cluster = clusters[index];
        const estimate = estimateRoute(routeOrigin(source), cluster, constraints);
        const identifier = `${source.deliveryZone?.code || 'ZONE'}-SPLIT-${digest(`${source.id}:${source.version}:${index}:${cluster.map((item) => item.id).join('|')}`, 10)}`;
        const created = await tx.deliveryRun.create({
          data: {
            routeCode: `${source.routeCode}-S${index + 1}-${digest(identifier, 4)}`,
            storeId: source.storeId,
            riderId: null,
            deliveryZoneId: source.deliveryZoneId,
            serviceDate: source.serviceDate,
            slotStart: source.slotStart,
            slotEnd: source.slotEnd,
            deliveryCluster: identifier,
            clusterIdentifier: identifier,
            status: DeliveryRunStatus.RIDER_NEEDED,
            planningAlgorithmVersion: source.planningAlgorithmVersion,
            plannedAt: new Date(),
            originalStopCount: cluster.length,
            totalStopCount: cluster.length,
            expectedCashPaise: cluster.reduce((sum, item) => sum + item.cashDuePaise, 0),
            expectedParcelCount: cluster.reduce((sum, item) => sum + item.parcelCount, 0),
            expectedBagCount: cluster.reduce((sum, item) => sum + item.parcelCount, 0),
            expectedItemCount: cluster.reduce((sum, item) => sum + item.value.expectedItemCount, 0),
            estimatedDistanceKm: estimate.distanceKm,
            estimatedDurationMinutes: estimate.durationMinutes,
            manualOverride: true,
            manualOverrideReason: dto.reason,
            assignmentSource: RouteAssignmentSource.MANUAL,
          },
        });
        runIds.push(created.id);
      }
      for (const runCluster of clusters) {
        for (const item of runCluster) {
          await tx.deliveryRunStop.update({ where: { id: item.id }, data: { sequenceNumber: -Math.abs(item.value.sequenceNumber) - 10_000 } });
        }
      }
      for (let runIndex = 0; runIndex < clusters.length; runIndex += 1) {
        const destinationRunId = runIds[runIndex];
        for (let stopIndex = 0; stopIndex < clusters[runIndex].length; stopIndex += 1) {
          const item = clusters[runIndex][stopIndex];
          await tx.deliveryRunStop.update({
            where: { id: item.id },
            data: {
              deliveryRunId: destinationRunId,
              sequenceNumber: stopIndex + 1,
              movedFromRunId: destinationRunId === source.id ? item.value.movedFromRunId : source.id,
              lastMovedAt: destinationRunId === source.id ? item.value.lastMovedAt : new Date(),
              routeOrderChangeReason: dto.reason,
              version: { increment: 1 },
            },
          });
        }
      }
      for (const id of runIds) await this.recalculate(tx, id);
      await tx.deliveryRun.update({
        where: { id: source.id },
        data: { manualOverride: true, manualOverrideReason: dto.reason, version: { increment: 1 } },
      });
      await this.audit(tx, {
        runId: source.id,
        actor,
        action: 'DELIVERY_RUN_SPLIT',
        reason: dto.reason,
        metadata: { method: dto.method, resultingRunIds: runIds, clusters: clusters.map((cluster) => cluster.map((item) => item.id)) },
        eventType: DeliveryRouteEventType.DELIVERY_RUN_SPLIT,
        dedupeKey: `manual-split:${source.id}:v${source.version}`,
      });
      return Promise.all(runIds.map((id) => tx.deliveryRun.findUniqueOrThrow({
        where: { id },
        include: { deliveryZone: true, rider: { include: { user: true } }, stops: { orderBy: { sequenceNumber: 'asc' } } },
      })));
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    for (let index = 0; index < result.length; index += 1) {
      const requestedRiderId = dto.riderIds?.[index];
      if (!requestedRiderId) continue;
      const ranked = await this.planner.rankEligibleRiders(result[index].id);
      const selected = ranked.find((item) => item.riderId === requestedRiderId);
      if (selected) await this.planner.assignRider(result[index].id, selected, actor, RouteAssignmentSource.MANUAL);
    }
    return Promise.all(result.map((run) => this.run(run.id)));
  }

  async merge(targetRunId: string, dto: MergeDeliveryRunsDto, actor: Actor) {
    const target = await this.run(targetRunId);
    this.assertVersion(target, dto.targetVersion);
    this.assertEditable(target);
    const sources = await Promise.all([...new Set(dto.sourceRunIds)].filter((id) => id !== targetRunId).map((id) => this.run(id)));
    if (!sources.length) throw new BadRequestException('Choose at least one different source run');
    for (const source of sources) {
      this.assertVersion(source, Number(dto.sourceVersions[source.id]));
      this.assertEditable(source);
      const compatible = source.storeId === target.storeId
        && source.serviceDate.getTime() === target.serviceDate.getTime()
        && source.slotStart.getTime() === target.slotStart.getTime()
        && source.slotEnd.getTime() === target.slotEnd.getTime()
        && source.deliveryZoneId === target.deliveryZoneId;
      if (!compatible) throw new BadRequestException(`Run ${source.routeCode} is not compatible with ${target.routeCode}`);
      if (source.riderId && target.riderId && source.riderId !== target.riderId) {
        throw new BadRequestException('Reassign routes to one rider before merging');
      }
    }
    const allStops = [...target.stops, ...sources.flatMap((source) => source.stops)].map(candidateFromStop);
    const constraints = this.constraints(target);
    const estimate = estimateRoute(routeOrigin(target), nearestNeighbourOrder(routeOrigin(target), allStops), constraints);
    const parcels = allStops.reduce((sum, item) => sum + item.parcelCount, 0);
    const cash = allStops.reduce((sum, item) => sum + item.cashDuePaise, 0);
    if (
      allStops.length > constraints.maximumStops
      || parcels > constraints.maximumParcels
      || cash > constraints.maximumCashPaise
      || estimate.distanceKm > constraints.maximumDistanceKm
      || estimate.durationMinutes > constraints.maximumDurationMinutes
    ) throw new BadRequestException('Merged route would exceed stop, parcel, cash, distance, or slot capacity');

    return prisma.$transaction(async (tx) => {
      const lockIds = [target.id, ...sources.map((source) => source.id)].sort().join(':');
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`manual-route-merge:${lockIds}`}))`);
      const ordered = nearestNeighbourOrder(routeOrigin(target), allStops);
      for (const item of ordered) {
        await tx.deliveryRunStop.update({ where: { id: item.id }, data: { sequenceNumber: -Math.abs(item.value.sequenceNumber) - 20_000 } });
      }
      for (let index = 0; index < ordered.length; index += 1) {
        const item = ordered[index];
        await tx.deliveryRunStop.update({
          where: { id: item.id },
          data: {
            deliveryRunId: target.id,
            sequenceNumber: index + 1,
            movedFromRunId: item.value.deliveryRunId === target.id ? item.value.movedFromRunId : item.value.deliveryRunId,
            lastMovedAt: item.value.deliveryRunId === target.id ? item.value.lastMovedAt : new Date(),
            routeOrderChangeReason: dto.reason,
            version: { increment: 1 },
          },
        });
      }
      for (const source of sources) {
        await tx.deliveryRun.update({
          where: { id: source.id },
          data: {
            status: DeliveryRunStatus.CANCELLED,
            totalStopCount: 0,
            expectedCashPaise: 0,
            expectedParcelCount: 0,
            expectedBagCount: 0,
            expectedItemCount: 0,
            manualOverride: true,
            manualOverrideReason: dto.reason,
            version: { increment: 1 },
          },
        });
      }
      await this.recalculate(tx, target.id);
      const updated = await tx.deliveryRun.update({
        where: { id: target.id },
        data: { manualOverride: true, manualOverrideReason: dto.reason, version: { increment: 1 } },
      });
      await this.audit(tx, {
        runId: target.id,
        actor,
        action: 'DELIVERY_RUN_MERGED',
        reason: dto.reason,
        metadata: { sourceRunIds: sources.map((source) => source.id), targetRunId: target.id },
        eventType: DeliveryRouteEventType.DELIVERY_RUN_MERGED,
        dedupeKey: `manual-merge:${target.id}:v${target.version}`,
      });
      return tx.deliveryRun.findUniqueOrThrow({
        where: { id: updated.id },
        include: { deliveryZone: true, rider: { include: { user: true } }, stops: { orderBy: { sequenceNumber: 'asc' } } },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async moveStop(sourceRunId: string, stopId: string, dto: MoveRunStopDto, actor: Actor) {
    if (sourceRunId === dto.destinationRunId) throw new BadRequestException('Source and destination runs must be different');
    const [source, destination] = await Promise.all([this.run(sourceRunId), this.run(dto.destinationRunId)]);
    this.assertVersion(source, dto.sourceRunVersion);
    this.assertVersion(destination, dto.destinationRunVersion);
    this.assertEditable(source);
    this.assertEditable(destination);
    const stop = source.stops.find((item) => item.id === stopId);
    if (!stop || stop.version !== dto.stopVersion) throw new ConflictException('Stop changed; refresh and try again');
    if (source.stops.length <= 1) throw new BadRequestException('Use merge or cancel instead of leaving an empty source run');
    const compatible = source.storeId === destination.storeId
      && source.serviceDate.getTime() === destination.serviceDate.getTime()
      && source.slotStart.getTime() === destination.slotStart.getTime()
      && source.slotEnd.getTime() === destination.slotEnd.getTime()
      && source.deliveryZoneId === destination.deliveryZoneId;
    if (!compatible) throw new BadRequestException('Stop can move only between compatible store, date, slot, and zone runs');
    if (source.riderId && destination.riderId && source.riderId !== destination.riderId) {
      throw new BadRequestException('Reassign the destination route before moving a stop between different riders');
    }
    const destinationCandidates = [...destination.stops, stop].map(candidateFromStop);
    const constraints = this.constraints(destination);
    const estimate = estimateRoute(routeOrigin(destination), nearestNeighbourOrder(routeOrigin(destination), destinationCandidates), constraints);
    if (
      destinationCandidates.length > constraints.maximumStops
      || destinationCandidates.reduce((sum, item) => sum + item.parcelCount, 0) > constraints.maximumParcels
      || destinationCandidates.reduce((sum, item) => sum + item.cashDuePaise, 0) > constraints.maximumCashPaise
      || estimate.distanceKm > constraints.maximumDistanceKm
      || estimate.durationMinutes > constraints.maximumDurationMinutes
    ) throw new BadRequestException('Destination route would exceed configured operational limits');

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`move-stop:${stopId}`}))`);
      await tx.deliveryRunStop.update({
        where: { id: stop.id },
        data: {
          deliveryRunId: destination.id,
          sequenceNumber: destination.stops.length + 1,
          movedFromRunId: source.id,
          lastMovedAt: new Date(),
          routeOrderChangeReason: dto.reason,
          version: { increment: 1 },
        },
      });
      if (destination.riderId && stop.deliveryJob.currentRiderId !== destination.riderId) {
        await tx.deliveryJob.update({ where: { id: stop.deliveryJobId }, data: { currentRiderId: destination.riderId, version: { increment: 1 } } });
      }
      await this.resequence(tx, source.id);
      await this.resequence(tx, destination.id);
      await this.recalculate(tx, source.id);
      await this.recalculate(tx, destination.id);
      await tx.deliveryRun.updateMany({
        where: { id: { in: [source.id, destination.id] } },
        data: { manualOverride: true, manualOverrideReason: dto.reason, version: { increment: 1 } },
      });
      await this.audit(tx, {
        runId: destination.id,
        actor,
        action: 'RUN_STOP_MOVED',
        reason: dto.reason,
        sourceRunId: source.id,
        destinationRunId: destination.id,
        stopId: stop.id,
        metadata: { stopId: stop.id, sourceRunId: source.id, destinationRunId: destination.id },
        eventType: DeliveryRouteEventType.RUN_STOP_MOVED,
        dedupeKey: `move-stop:${stop.id}:v${stop.version}`,
      });
      return Promise.all([source.id, destination.id].map((id) => tx.deliveryRun.findUniqueOrThrow({
        where: { id }, include: { deliveryZone: true, rider: { include: { user: true } }, stops: { orderBy: { sequenceNumber: 'asc' } } },
      })));
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async reassign(runId: string, dto: ReassignRegionalRunDto, actor: Actor) {
    const run = await this.run(runId);
    this.assertVersion(run, dto.version);
    this.assertEditable(run);
    const ranked = await this.planner.rankEligibleRiders(run.id);
    const selected = ranked.find((item) => item.riderId === dto.riderId);
    if (!selected) throw new BadRequestException('Selected rider is not eligible for this route');
    selected.summary = `${dto.reason}; ${selected.summary}`;
    return this.planner.assignRider(run.id, selected, actor, RouteAssignmentSource.MANUAL);
  }

  async reorder(runId: string, dto: ReorderRegionalRunDto, actor: Actor) {
    const run = await this.run(runId);
    this.assertVersion(run, dto.version);
    this.assertEditable(run);
    const existing = new Set(run.stops.map((stop) => stop.id));
    if (dto.orderedStopIds.length !== existing.size || dto.orderedStopIds.some((id) => !existing.has(id))) {
      throw new BadRequestException('Ordered stop list must contain every route stop exactly once');
    }
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`reorder-run:${run.id}`}))`);
      for (const stop of run.stops) await tx.deliveryRunStop.update({ where: { id: stop.id }, data: { sequenceNumber: -stop.sequenceNumber - 30_000 } });
      for (let index = 0; index < dto.orderedStopIds.length; index += 1) {
        await tx.deliveryRunStop.update({
          where: { id: dto.orderedStopIds[index] },
          data: { sequenceNumber: index + 1, routeOrderChangeReason: dto.reason, version: { increment: 1 } },
        });
      }
      await this.recalculate(tx, run.id);
      const updated = await tx.deliveryRun.update({
        where: { id: run.id },
        data: { manualOverride: true, manualOverrideReason: dto.reason, version: { increment: 1 } },
      });
      await this.audit(tx, {
        runId: run.id,
        actor,
        action: 'RUN_STOP_REORDERED',
        reason: dto.reason,
        metadata: { orderedStopIds: dto.orderedStopIds },
        eventType: DeliveryRouteEventType.RUN_STOP_REORDERED,
        dedupeKey: `reorder-run:${run.id}:v${run.version}`,
      });
      return tx.deliveryRun.findUniqueOrThrow({
        where: { id: updated.id },
        include: { deliveryZone: true, rider: { include: { user: true } }, stops: { orderBy: { sequenceNumber: 'asc' } } },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async cancel(runId: string, dto: CancelRegionalRunDto, actor: Actor) {
    const run = await this.run(runId);
    this.assertVersion(run, dto.version);
    this.assertEditable(run);
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`cancel-run:${run.id}`}))`);
      for (const stop of run.stops) {
        await tx.subscriptionDelivery.update({ where: { id: stop.subscriptionDeliveryId }, data: { status: SubscriptionDeliveryStatus.ORDER_GENERATED } });
        if ([DeliveryJobStatus.WAITING_FOR_DISPATCH, DeliveryJobStatus.RIDER_ASSIGNED].includes(stop.deliveryJob.status as DeliveryJobStatus)) {
          await tx.deliveryJob.update({
            where: { id: stop.deliveryJobId },
            data: { status: DeliveryJobStatus.WAITING_FOR_DISPATCH, currentRiderId: null, version: { increment: 1 } },
          });
        }
      }
      await tx.deliveryRunStop.deleteMany({ where: { deliveryRunId: run.id } });
      const updated = await tx.deliveryRun.update({
        where: { id: run.id },
        data: {
          status: DeliveryRunStatus.CANCELLED,
          totalStopCount: 0,
          expectedCashPaise: 0,
          expectedParcelCount: 0,
          expectedBagCount: 0,
          expectedItemCount: 0,
          manualOverride: true,
          manualOverrideReason: dto.reason,
          version: { increment: 1 },
        },
      });
      await this.audit(tx, {
        runId: run.id,
        actor,
        action: 'DELIVERY_RUN_CANCELLED',
        reason: dto.reason,
        metadata: { releasedStopIds: run.stops.map((stop) => stop.id) },
        eventType: DeliveryRouteEventType.DELIVERY_RUN_CANCELLED,
        dedupeKey: `cancel-run:${run.id}:v${run.version}`,
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async interruptAndRecover(runId: string, dto: InterruptDeliveryRunDto, actor: Actor) {
    const run = await this.run(runId);
    this.assertVersion(run, dto.version);
    if (![DeliveryRunStatus.READY_FOR_PICKUP, DeliveryRunStatus.PICKED_UP, DeliveryRunStatus.IN_PROGRESS].includes(run.status)) {
      throw new BadRequestException('Only a prepared or active route can be interrupted');
    }
    const pending = run.stops.filter((stop) => ![
      DeliveryRunStopStatus.DELIVERED,
      DeliveryRunStopStatus.RETURNED,
      DeliveryRunStopStatus.CANCELLED,
    ].includes(stop.status));
    if (!pending.length) throw new BadRequestException('No pending stops remain for a recovery route');
    const completed = run.stops.filter((stop) => stop.status === DeliveryRunStopStatus.DELIVERED);
    const recovery = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`recovery-run:${run.id}`}))`);
      const existing = await tx.deliveryRun.findFirst({ where: { recoveryFromRunId: run.id, status: { not: DeliveryRunStatus.CANCELLED } } });
      if (existing) throw new ConflictException('An active recovery run already exists');
      const ordered = nearestNeighbourOrder(routeOrigin(run), pending.map(candidateFromStop));
      const estimate = estimateRoute(routeOrigin(run), ordered, this.constraints(run));
      const identifier = `${run.deliveryZone?.code || 'ZONE'}-RECOVERY-${digest(`${run.id}:${run.version}:${pending.map((stop) => stop.id).sort().join('|')}`, 10)}`;
      const created = await tx.deliveryRun.create({
        data: {
          routeCode: `${run.routeCode}-REC-${digest(identifier, 4)}`,
          storeId: run.storeId,
          riderId: null,
          deliveryZoneId: run.deliveryZoneId,
          serviceDate: run.serviceDate,
          slotStart: run.slotStart,
          slotEnd: run.slotEnd,
          deliveryCluster: identifier,
          clusterIdentifier: identifier,
          status: DeliveryRunStatus.RIDER_NEEDED,
          planningAlgorithmVersion: run.planningAlgorithmVersion,
          plannedAt: new Date(),
          originalStopCount: pending.length,
          totalStopCount: pending.length,
          expectedCashPaise: pending.reduce((sum, stop) => sum + stop.cashDuePaise, 0),
          expectedParcelCount: pending.reduce((sum, stop) => sum + stop.expectedParcelCount, 0),
          expectedBagCount: pending.reduce((sum, stop) => sum + stop.expectedParcelCount, 0),
          expectedItemCount: pending.reduce((sum, stop) => sum + stop.expectedItemCount, 0),
          estimatedDistanceKm: estimate.distanceKm,
          estimatedDurationMinutes: estimate.durationMinutes,
          recoveryFromRunId: run.id,
          manualOverride: true,
          manualOverrideReason: dto.reason,
          assignmentSource: RouteAssignmentSource.RECOVERY,
        },
      });
      for (const stop of pending) await tx.deliveryRunStop.update({ where: { id: stop.id }, data: { sequenceNumber: -stop.sequenceNumber - 40_000 } });
      for (let index = 0; index < ordered.length; index += 1) {
        const stop = ordered[index].value;
        await tx.deliveryRunStop.update({
          where: { id: stop.id },
          data: {
            deliveryRunId: created.id,
            sequenceNumber: index + 1,
            movedFromRunId: run.id,
            lastMovedAt: new Date(),
            routeOrderChangeReason: dto.reason,
            status: stop.status === DeliveryRunStopStatus.ARRIVED ? DeliveryRunStopStatus.RETRY_PENDING : stop.status,
            version: { increment: 1 },
          },
        });
      }
      await this.recalculate(tx, run.id);
      await tx.deliveryRun.update({
        where: { id: run.id },
        data: {
          status: DeliveryRunStatus.INTERRUPTED,
          interruptedAt: new Date(),
          interruptionReason: dto.reason,
          completedStopCount: completed.length,
          version: { increment: 1 },
        },
      });
      await this.audit(tx, {
        runId: run.id,
        actor,
        action: 'DELIVERY_RUN_INTERRUPTED',
        reason: dto.reason,
        destinationRunId: created.id,
        metadata: { completedStopIds: completed.map((stop) => stop.id), pendingStopIds: pending.map((stop) => stop.id), recoveryRunId: created.id },
        eventType: DeliveryRouteEventType.DELIVERY_RUN_INTERRUPTED,
        dedupeKey: `interrupt-run:${run.id}:v${run.version}`,
      });
      await this.audit(tx, {
        runId: created.id,
        actor,
        action: 'RECOVERY_RUN_CREATED',
        reason: dto.reason,
        sourceRunId: run.id,
        metadata: { sourceRunId: run.id, pendingStopIds: pending.map((stop) => stop.id) },
        eventType: DeliveryRouteEventType.RECOVERY_RUN_CREATED,
        dedupeKey: `recovery-created:${run.id}:v${run.version}`,
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (dto.recoveryRiderId) {
      const ranked = await this.planner.rankEligibleRiders(recovery.id);
      const selected = ranked.find((item) => item.riderId === dto.recoveryRiderId);
      if (!selected) throw new BadRequestException('Requested recovery rider is not eligible');
      await this.planner.assignRider(recovery.id, selected, actor, RouteAssignmentSource.RECOVERY);
      await prisma.deliveryRun.update({ where: { id: recovery.id }, data: { status: DeliveryRunStatus.IN_PROGRESS, startedAt: new Date(), version: { increment: 1 } } });
    }
    return { original: await this.run(run.id), recovery: await this.run(recovery.id) };
  }

  async dashboard(date?: string) {
    const day = date ? new Date(`${date}T00:00:00.000Z`) : new Date();
    const from = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
    const to = new Date(from.getTime() + 86_400_000);
    const [zones, runs, unassigned, riders, recentEvents] = await Promise.all([
      prisma.deliveryZone.findMany({
        where: { isActive: true },
        orderBy: [{ priority: 'desc' }, { name: 'asc' }],
        include: { storeLinks: true, preferredRiderLinks: true },
      }),
      prisma.deliveryRun.findMany({
        where: { serviceDate: { gte: from, lt: to }, status: { not: DeliveryRunStatus.CANCELLED } },
        orderBy: [{ slotStart: 'asc' }, { routeCode: 'asc' }],
        include: {
          deliveryZone: true,
          store: { select: { id: true, name: true, latitude: true, longitude: true, address: true } },
          rider: { include: { user: { select: { id: true, name: true } }, availabilityLocation: true } },
          stops: {
            orderBy: { sequenceNumber: 'asc' },
            include: { deliveryJob: { include: { order: { include: { customer: { select: { name: true } } } } } } },
          },
        },
      }),
      prisma.subscriptionDelivery.findMany({
        where: {
          serviceDate: { gte: from, lt: to },
          status: SubscriptionDeliveryStatus.ORDER_GENERATED,
          runStop: null,
        },
        include: { subscription: { include: { address: true } }, order: true, store: true, deliveryZone: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.riderProfile.findMany({
        where: { user: { isActive: true }, approvalStatus: 'APPROVED' },
        include: { user: { select: { id: true, name: true } }, availabilityLocation: true, homeZone: true },
        orderBy: { user: { name: 'asc' } },
      }),
      prisma.deliveryRouteEvent.findMany({
        where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);
    const zoneSummaries = zones.map((zone) => {
      const zoneRuns = runs.filter((run) => run.deliveryZoneId === zone.id);
      return {
        ...zone,
        deliveryCount: zoneRuns.reduce((sum, run) => sum + run.totalStopCount, 0),
        availableRiderCount: riders.filter((rider) => rider.status === 'ONLINE' && (rider.homeZoneId === zone.id || zone.preferredRiderLinks.some((link) => link.riderProfileId === rider.id))).length,
        estimatedDurationMinutes: zoneRuns.reduce((sum, run) => sum + run.estimatedDurationMinutes, 0),
        expectedCashPaise: zoneRuns.reduce((sum, run) => sum + run.expectedCashPaise, 0),
        status: zoneRuns.some((run) => run.status === DeliveryRunStatus.RIDER_NEEDED) ? 'RIDER_NEEDED'
          : zoneRuns.some((run) => run.expectedCashPaise > zone.cashRiskLimitPaise) ? 'CASH_LIMIT_RISK'
            : zoneRuns.length ? 'READY' : 'EMPTY',
      };
    });
    return {
      date: from.toISOString().slice(0, 10),
      zones: zoneSummaries,
      runs,
      unassigned,
      riders,
      recentEvents,
      totals: {
        deliveries: runs.reduce((sum, run) => sum + run.totalStopCount, 0),
        runs: runs.length,
        unassigned: unassigned.length,
        ridersNeeded: runs.filter((run) => run.status === DeliveryRunStatus.RIDER_NEEDED).length,
        expectedCashPaise: runs.reduce((sum, run) => sum + run.expectedCashPaise, 0),
        collectedCashPaise: runs.reduce((sum, run) => sum + run.collectedCashPaise, 0),
        heldCashPaise: runs.reduce((sum, run) => sum + Math.max(0, run.collectedCashPaise - run.depositedCashPaise), 0),
      },
    };
  }

  async events(after?: string) {
    return prisma.deliveryRouteEvent.findMany({
      where: after ? { createdAt: { gt: new Date(after) } } : undefined,
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
  }

  private async resequence(tx: Tx, runId: string) {
    const stops = await tx.deliveryRunStop.findMany({ where: { deliveryRunId: runId }, orderBy: [{ sequenceNumber: 'asc' }, { id: 'asc' }] });
    for (const stop of stops) await tx.deliveryRunStop.update({ where: { id: stop.id }, data: { sequenceNumber: -Math.abs(stop.sequenceNumber) - 50_000 } });
    for (let index = 0; index < stops.length; index += 1) await tx.deliveryRunStop.update({ where: { id: stops[index].id }, data: { sequenceNumber: index + 1 } });
  }

  private async recalculate(tx: Tx, runId: string) {
    const run = await tx.deliveryRun.findUnique({ where: { id: runId }, include: { store: true, deliveryZone: true, stops: { orderBy: { sequenceNumber: 'asc' } } } });
    if (!run) return;
    const candidates = run.stops.map((stop) => ({
      id: stop.id,
      latitude: Number(stop.deliveryLatitude),
      longitude: Number(stop.deliveryLongitude),
      parcelCount: stop.expectedParcelCount,
      cashDuePaise: stop.cashDuePaise,
      value: stop,
    })).filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
    const estimate = estimateRoute(
      { latitude: run.store.latitude, longitude: run.store.longitude },
      candidates,
      { averageSpeedKph: Number(process.env.ROUTE_AVERAGE_SPEED_KPH || 22), serviceMinutesPerStop: Number(process.env.ROUTE_SERVICE_MINUTES_PER_STOP || 5) },
    );
    await tx.deliveryRun.update({
      where: { id: run.id },
      data: {
        totalStopCount: run.stops.length,
        completedStopCount: run.stops.filter((stop) => stop.status === DeliveryRunStopStatus.DELIVERED).length,
        failedStopCount: run.stops.filter((stop) => stop.status === DeliveryRunStopStatus.FAILED).length,
        retryPendingStopCount: run.stops.filter((stop) => stop.status === DeliveryRunStopStatus.RETRY_PENDING).length,
        expectedCashPaise: run.stops.reduce((sum, stop) => sum + stop.cashDuePaise, 0),
        expectedParcelCount: run.stops.reduce((sum, stop) => sum + stop.expectedParcelCount, 0),
        expectedBagCount: run.stops.reduce((sum, stop) => sum + stop.expectedParcelCount, 0),
        expectedItemCount: run.stops.reduce((sum, stop) => sum + stop.expectedItemCount, 0),
        estimatedDistanceKm: estimate.distanceKm,
        estimatedDurationMinutes: estimate.durationMinutes,
      },
    });
  }

  private async audit(tx: Tx, input: {
    runId: string;
    actor: Actor;
    action: string;
    reason: string;
    sourceRunId?: string;
    destinationRunId?: string;
    stopId?: string;
    metadata: Prisma.InputJsonValue;
    eventType: DeliveryRouteEventType;
    dedupeKey: string;
  }) {
    await tx.deliveryRunAuditEntry.create({
      data: {
        deliveryRunId: input.runId,
        actorUserId: input.actor.id,
        actorRole: input.actor.role,
        action: input.action,
        reason: input.reason,
        sourceRunId: input.sourceRunId,
        destinationRunId: input.destinationRunId,
        metadata: input.metadata,
        idempotencyKey: input.dedupeKey,
      },
    });
    await tx.deliveryRouteEvent.create({
      data: {
        eventType: input.eventType,
        deliveryRunId: input.runId,
        deliveryRunStopId: input.stopId,
        actorUserId: input.actor.id,
        payload: input.metadata,
        dedupeKey: `event:${input.dedupeKey}`,
      },
    });
  }
}
