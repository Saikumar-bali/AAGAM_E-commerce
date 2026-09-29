/**
 * Split, merge, move, reorder, reassign, cancel and recovery mutations.
 *
 * Split out of the former regional-route-operations.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { DeliveryRouteEventType, DeliveryRunStatus, DeliveryRunStopStatus, Prisma, RouteAssignmentSource, prisma } from '@aagam/database';
import { CancelRegionalRunDto, InterruptDeliveryRunDto, MergeDeliveryRunsDto, MoveRunStopDto, PreviewRouteSplitDto, ReassignRegionalRunDto, ReorderRegionalRunDto, RouteSplitMethod, SplitDeliveryRunDto } from './regional-routing.dto';
import { estimateRoute, nearestNeighbourOrder, splitByOperationalConstraints } from './regional-routing.geometry';
import { RegionalRouteOperationsServiceBase, Actor, Tx, EditableRun, INTERRUPTIBLE_RUN_STATUSES, TERMINAL_STOP_STATUSES, MOVABLE_JOB_STATUSES, digest, routeOrigin, candidateFromStop } from './regional-route-operations.service.base';
import { RegionalRoutePlanningService } from './regional-route-planning.service';

export class RegionalRouteMutationService extends RegionalRouteOperationsServiceBase {
  constructor(private readonly planner: RegionalRoutePlanningService) {
    super();
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
    if (clusters.length >= 2) return clusters;

    const midpoint = Math.ceil(candidates.length / 2);
    return [
      nearestNeighbourOrder(routeOrigin(run), candidates.slice(0, midpoint)),
      nearestNeighbourOrder(routeOrigin(run), candidates.slice(midpoint)),
    ];
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
          expectedWeightGrams: cluster.reduce((sum, item) => sum + (item.weightGrams ?? 0), 0),
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

    const runIds = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`manual-route-split:${runId}`}))`);
      const current = await tx.deliveryRun.findUnique({ where: { id: runId }, select: { version: true } });
      if (!current || current.version !== dto.version) throw new ConflictException('Delivery run changed during split');

      const ids = [source.id];
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
            expectedWeightGrams: cluster.reduce((sum, item) => sum + (item.weightGrams ?? 0), 0),
            estimatedDistanceKm: estimate.distanceKm,
            estimatedDurationMinutes: estimate.durationMinutes,
            manualOverride: true,
            manualOverrideReason: dto.reason,
            assignmentSource: RouteAssignmentSource.MANUAL,
          },
        });
        ids.push(created.id);
      }

      for (const cluster of clusters) {
        for (const item of cluster) {
          await tx.deliveryRunStop.update({
            where: { id: item.id },
            data: { sequenceNumber: -Math.abs(item.value.sequenceNumber) - 10_000 },
          });
        }
      }

      for (let runIndex = 0; runIndex < clusters.length; runIndex += 1) {
        const destinationRunId = ids[runIndex];
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
          if (destinationRunId !== source.id) {
            await this.resetPendingJobOwnership(tx, item.value, null);
          }
        }
      }

      for (const id of ids) await this.recalculate(tx, id);
      await tx.deliveryRun.update({
        where: { id: source.id },
        data: { manualOverride: true, manualOverrideReason: dto.reason, version: { increment: 1 } },
      });
      for (let index = 0; index < ids.length; index += 1) {
        const requestedRiderId = dto.riderIds?.[index];
        if (!requestedRiderId) continue;
        await this.planner.assignRiderWithinTransaction(
          tx, ids[index], requestedRiderId, actor, RouteAssignmentSource.MANUAL, dto.reason,
        );
      }
      await this.audit(tx, {
        runId: source.id,
        actor,
        action: 'DELIVERY_RUN_SPLIT',
        reason: dto.reason,
        metadata: {
          method: dto.method,
          resultingRunIds: ids,
          clusters: clusters.map((cluster) => cluster.map((item) => item.id)),
          requestedRiderIds: dto.riderIds ?? [],
        },
        eventType: DeliveryRouteEventType.DELIVERY_RUN_SPLIT,
        dedupeKey: `manual-split:${source.id}:v${source.version}`,
      });
      return ids;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return Promise.all(runIds.map((id) => this.run(id)));
  }

  async merge(targetRunId: string, dto: MergeDeliveryRunsDto, actor: Actor) {
    const target = await this.run(targetRunId);
    this.assertVersion(target, dto.targetVersion);
    this.assertEditable(target);
    const sourceIds = [...new Set(dto.sourceRunIds)].filter((id) => id !== targetRunId);
    if (!sourceIds.length) throw new BadRequestException('Choose at least one different source run');
    const sources = await Promise.all(sourceIds.map((id) => this.run(id)));

    for (const source of sources) {
      this.assertVersion(source, Number(dto.sourceVersions[source.id]));
      this.assertEditable(source);
      const compatible = source.storeId === target.storeId
        && source.serviceDate.getTime() === target.serviceDate.getTime()
        && source.slotStart.getTime() === target.slotStart.getTime()
        && source.slotEnd.getTime() === target.slotEnd.getTime()
        && source.deliveryZoneId === target.deliveryZoneId;
      if (!compatible) throw new BadRequestException(`Run ${source.routeCode} is not compatible with ${target.routeCode}`);
    }

    const mergedRiderIds = [...new Set(
      [target.riderId, ...sources.map((source) => source.riderId)].filter((id): id is string => Boolean(id)),
    )];
    if (mergedRiderIds.length > 1) throw new BadRequestException('Reassign routes to one rider before merging');
    const mergedRiderId = mergedRiderIds[0] ?? null;
    const allStops = [...target.stops, ...sources.flatMap((source) => source.stops)].map(candidateFromStop);
    this.assertCapacity(target, allStops);

    return prisma.$transaction(async (tx) => {
      const lockIds = [target.id, ...sources.map((source) => source.id)].sort().join(':');
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`manual-route-merge:${lockIds}`}))`);
      const ordered = nearestNeighbourOrder(routeOrigin(target), allStops);
      for (const item of ordered) {
        await tx.deliveryRunStop.update({
          where: { id: item.id },
          data: { sequenceNumber: -Math.abs(item.value.sequenceNumber) - 20_000 },
        });
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
        await this.resetPendingJobOwnership(tx, item.value, mergedRiderId);
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
            expectedWeightGrams: 0,
            manualOverride: true,
            manualOverrideReason: dto.reason,
            version: { increment: 1 },
          },
        });
      }
      await this.recalculate(tx, target.id);
      const updated = await tx.deliveryRun.update({
        where: { id: target.id },
        data: {
          riderId: mergedRiderId,
          status: mergedRiderId ? DeliveryRunStatus.PLANNED : DeliveryRunStatus.RIDER_NEEDED,
          manualOverride: true,
          manualOverrideReason: dto.reason,
          version: { increment: 1 },
        },
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
    if (!MOVABLE_JOB_STATUSES.has(stop.deliveryJob.status)) {
      throw new BadRequestException('Only a pending, unstarted delivery job can move between runs');
    }
    const compatible = source.storeId === destination.storeId
      && source.serviceDate.getTime() === destination.serviceDate.getTime()
      && source.slotStart.getTime() === destination.slotStart.getTime()
      && source.slotEnd.getTime() === destination.slotEnd.getTime()
      && source.deliveryZoneId === destination.deliveryZoneId;
    if (!compatible) throw new BadRequestException('Stop can move only between compatible store, date, slot, and zone runs');
    if (source.riderId && destination.riderId && source.riderId !== destination.riderId) {
      throw new BadRequestException('Reassign the destination route before moving a stop between different riders');
    }

    this.assertCapacity(destination, [...destination.stops, stop].map(candidateFromStop));
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`move-stop:${stopId}`}))`);
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
      await this.resetPendingJobOwnership(tx, stop, destination.riderId);
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
        where: { id },
        include: { deliveryZone: true, rider: { include: { user: true } }, stops: { orderBy: { sequenceNumber: 'asc' } } },
      })));
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async reassign(runId: string, dto: ReassignRegionalRunDto, actor: Actor) {
    const run = await this.run(runId);
    this.assertVersion(run, dto.version);
    this.assertEditable(run);
    const selected = (await this.planner.rankEligibleRiders(run.id)).find((item) => item.riderId === dto.riderId);
    if (!selected) throw new BadRequestException('Selected rider is not eligible for this route');
    return this.planner.assignRider(
      run.id,
      { ...selected, summary: `${dto.reason}; ${selected.summary}` },
      actor,
      RouteAssignmentSource.MANUAL,
    );
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
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`reorder-run:${run.id}`}))`);
      for (const stop of run.stops) {
        await tx.deliveryRunStop.update({ where: { id: stop.id }, data: { sequenceNumber: -stop.sequenceNumber - 30_000 } });
      }
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
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`cancel-run:${run.id}`}))`);
      for (const stop of run.stops) {
        await this.resetPendingJobOwnership(tx, stop, null);
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
    if (!INTERRUPTIBLE_RUN_STATUSES.has(run.status)) {
      throw new BadRequestException('Only a prepared or active route can be interrupted');
    }
    const pending = run.stops.filter((stop) => !TERMINAL_STOP_STATUSES.has(stop.status));
    if (!pending.length) throw new BadRequestException('No pending stops remain for a recovery route');
    const cashProtected = pending.find((stop) => Number(stop.deliveryJob.codLedger?.collectedAmountPaise || 0) > 0);
    if (cashProtected) throw new BadRequestException(`Stop ${cashProtected.sequenceNumber} has collected cash and must remain with the original rider`);
    const completed = run.stops.filter((stop) => stop.status === DeliveryRunStopStatus.DELIVERED);

    const recoveryId = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`recovery-run:${run.id}`}))`);
      const existing = await tx.deliveryRun.findFirst({
        where: { recoveryFromRunId: run.id, status: { not: DeliveryRunStatus.CANCELLED } },
        select: { id: true },
      });
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
          expectedWeightGrams: pending.reduce((sum, stop) => sum + stop.expectedWeightGrams, 0),
          estimatedDistanceKm: estimate.distanceKm,
          estimatedDurationMinutes: estimate.durationMinutes,
          recoveryFromRunId: run.id,
          manualOverride: true,
          manualOverrideReason: dto.reason,
          assignmentSource: RouteAssignmentSource.RECOVERY,
        },
      });

      for (const stop of pending) {
        await tx.deliveryRunStop.update({
          where: { id: stop.id },
          data: { sequenceNumber: -stop.sequenceNumber - 40_000 },
        });
      }
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
            status: stop.status === DeliveryRunStopStatus.ARRIVED
              ? DeliveryRunStopStatus.RETRY_PENDING
              : stop.status,
            version: { increment: 1 },
          },
        });
        await this.resetPendingJobOwnership(tx, stop, null);
        await tx.deliveryEvent.create({
          data: {
            deliveryJobId: stop.deliveryJobId,
            eventType: 'ASSIGNMENT_REASSIGNED',
            actorUserId: actor.id,
            actorRole: actor.role,
            metadata: {
              fromRiderId: run.riderId,
              toRiderId: null,
              sourceRunId: run.id,
              recoveryRunId: created.id,
              reason: dto.reason,
            },
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
        metadata: {
          completedStopIds: completed.map((stop) => stop.id),
          pendingStopIds: pending.map((stop) => stop.id),
          recoveryRunId: created.id,
        },
        eventType: DeliveryRouteEventType.DELIVERY_RUN_INTERRUPTED,
        dedupeKey: `interrupt-run:${run.id}:v${run.version}`,
      });
      if (dto.recoveryRiderId) {
        await this.planner.assignRiderWithinTransaction(
          tx, created.id, dto.recoveryRiderId, actor, RouteAssignmentSource.RECOVERY, dto.reason,
        );
      }
      await this.audit(tx, {
        runId: created.id,
        actor,
        action: 'RECOVERY_RUN_CREATED',
        reason: dto.reason,
        sourceRunId: run.id,
        metadata: { sourceRunId: run.id, pendingStopIds: pending.map((stop) => stop.id), recoveryRiderId: dto.recoveryRiderId ?? null },
        eventType: DeliveryRouteEventType.RECOVERY_RUN_CREATED,
        dedupeKey: `recovery-created:${run.id}:v${run.version}`,
      });
      return created.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return { original: await this.run(run.id), recovery: await this.run(recoveryId) };
  }

  private async resequence(tx: Tx, runId: string) {
    const stops = await tx.deliveryRunStop.findMany({
      where: { deliveryRunId: runId },
      orderBy: [{ sequenceNumber: 'asc' }, { id: 'asc' }],
    });
    for (const stop of stops) {
      await tx.deliveryRunStop.update({
        where: { id: stop.id },
        data: { sequenceNumber: -Math.abs(stop.sequenceNumber) - 50_000 },
      });
    }
    for (let index = 0; index < stops.length; index += 1) {
      await tx.deliveryRunStop.update({
        where: { id: stops[index].id },
        data: { sequenceNumber: index + 1 },
      });
    }
  }
}
