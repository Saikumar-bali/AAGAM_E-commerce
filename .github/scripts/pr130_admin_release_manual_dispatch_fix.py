from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    source = file.read_text()
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:180]!r}")
    file.write_text(source.replace(old, new, 1))


rider_service = 'apps/api-gateway/src/riders/rider.service.ts'
replace_once(
    rider_service,
    '''        const becomesOnline = data.status === 'ONLINE' && rider.status !== 'ONLINE';
        if (becomesOnline && !coordinates) {
          throw new BadRequestException(
            'Current latitude and longitude are required before setting the Rider online',
          );
        }
''',
    '''        const becomesOnline = data.status === 'ONLINE' && rider.status !== 'ONLINE';
        const canReuseFreshAvailability =
          becomesOnline && !coordinates && rider.status === 'BUSY'
            ? await this.hasFreshAvailability(tx, rider.id)
            : false;
        if (becomesOnline && !coordinates && !canReuseFreshAvailability) {
          throw new BadRequestException(
            'Current latitude and longitude are required before setting the Rider online',
          );
        }
''',
)
replace_once(
    rider_service,
    '''  private coordinates(data: { latitude?: number; longitude?: number }) {
''',
    '''  private async hasFreshAvailability(tx: DbClient, riderProfileId: string) {
    const configured = Number(process.env.AUTO_DISPATCH_LOCATION_MAX_AGE_SECONDS);
    const maxAgeSeconds = Number.isFinite(configured)
      ? Math.max(30, Math.min(86_400, Math.floor(configured)))
      : 180;
    const availability = await tx.riderAvailabilityLocation.findUnique({
      where: { riderProfileId },
      select: { capturedAt: true },
    });
    return Boolean(
      availability &&
        availability.capturedAt >=
          new Date(Date.now() - maxAgeSeconds * 1_000),
    );
  }

  private coordinates(data: { latitude?: number; longitude?: number }) {
''',
)


manual_dispatch = 'apps/api-gateway/src/orders/dispatch-assignment.service.ts'
replace_once(
    manual_dispatch,
    '''          const now = new Date();
          await tx.dispatchAssignment.updateMany({
            where: {
              deliveryJobId,
              status: DispatchAssignmentStatus.OFFERED,
              expiresAt: { lt: now },
            },
            data: {
              status: DispatchAssignmentStatus.EXPIRED,
              respondedAt: now,
            },
          });

          const assignment = await tx.dispatchAssignment.create({
''',
    '''          const now = new Date();
          const expiredOffers = await tx.dispatchAssignment.findMany({
            where: {
              riderProfileId: rider.id,
              status: DispatchAssignmentStatus.OFFERED,
              expiresAt: { lt: now },
            },
            select: {
              id: true,
              deliveryJobId: true,
              riderProfileId: true,
              expiresAt: true,
            },
          });
          for (const expiredOffer of expiredOffers) {
            const changed = await tx.dispatchAssignment.updateMany({
              where: {
                id: expiredOffer.id,
                status: DispatchAssignmentStatus.OFFERED,
                expiresAt: { lt: now },
              },
              data: {
                status: DispatchAssignmentStatus.EXPIRED,
                respondedAt: now,
              },
            });
            if (changed.count !== 1) continue;
            await this.events.record(
              {
                deliveryJobId: expiredOffer.deliveryJobId,
                assignmentId: expiredOffer.id,
                eventType: DeliveryEventType.ASSIGNMENT_EXPIRED,
                actor,
                metadata: {
                  source: 'MANUAL_DISPATCH_RIDER_RECONCILER',
                  riderProfileId: expiredOffer.riderProfileId,
                  expiresAt: expiredOffer.expiresAt?.toISOString() || null,
                },
              },
              tx
            );
          }

          const otherOpenOffer = await tx.dispatchAssignment.findFirst({
            where: {
              riderProfileId: rider.id,
              status: DispatchAssignmentStatus.OFFERED,
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            select: { id: true, deliveryJobId: true },
          });
          if (otherOpenOffer) {
            throw new ConflictException(
              `Rider already has active offer ${otherOpenOffer.id}`
            );
          }

          const assignment = await tx.dispatchAssignment.create({
''',
)


e2e = 'apps/api-gateway/src/auto-dispatch-recovery.e2e.spec.ts'
replace_once(
    e2e,
    "import { AutoDispatchService } from './orders/auto-dispatch.service';\n",
    "import { AutoDispatchService } from './orders/auto-dispatch.service';\nimport { DispatchAssignmentService } from './orders/dispatch-assignment.service';\n",
)
replace_once(
    e2e,
    '''const dispatch = () => new AutoDispatchService(new DeliveryEventService());
''',
    '''const dispatch = () => new AutoDispatchService(new DeliveryEventService());
const manualDispatch = () =>
  new DispatchAssignmentService({} as any, {} as any, new DeliveryEventService());
''',
)
replace_once(
    e2e,
    '''    await expect(dispatch().dispatchNearestRider(target.job.id)).resolves.toMatchObject({
      offered: false,
      reason: 'NO_FRESH_AVAILABLE_RIDER',
    });
  });

  it('reconciles a Rider expired offer before creating the next offer', async () => {
''',
    '''    await expect(dispatch().dispatchNearestRider(target.job.id)).resolves.toMatchObject({
      offered: false,
      reason: 'NO_FRESH_AVAILABLE_RIDER',
    });
    await expect(
      service.updateStatus(candidate.profile.id, { status: 'ONLINE' }),
    ).resolves.toMatchObject({ status: 'ONLINE' });
  });

  it('reconciles a Rider expired offer before creating the next offer', async () => {
''',
)
replace_once(
    e2e,
    '''  it('prevents active Riders from going offline and concurrent jobs from double-offering one Rider', async () => {
''',
    '''  it('reconciles a Rider expired offer before manual dispatch creates another', async () => {
    const previous = await waiting(`manual_expired_previous_${Date.now()}`);
    const target = await waiting(`manual_expired_target_${Date.now()}`);
    const candidate = await rider('manual_expired_candidate', 'ONLINE', 17.7003, 83.3003);
    const expiredOffer = await prisma.dispatchAssignment.create({
      data: {
        deliveryJobId: previous.job.id,
        riderProfileId: candidate.profile.id,
        status: DispatchAssignmentStatus.OFFERED,
        offeredAt: new Date(Date.now() - 61_000),
        expiresAt: new Date(Date.now() - 1_000),
      },
    });

    await expect(
      manualDispatch().offer(
        target.job.id,
        candidate.user.id,
        { id: target.owner.id, role: Role.ADMIN },
      ),
    ).resolves.toMatchObject({
      deliveryJobId: target.job.id,
      riderProfileId: candidate.profile.id,
      status: DispatchAssignmentStatus.OFFERED,
    });
    await expect(
      prisma.dispatchAssignment.findUnique({ where: { id: expiredOffer.id } }),
    ).resolves.toMatchObject({ status: DispatchAssignmentStatus.EXPIRED });
    expect(
      await prisma.deliveryEvent.findFirst({
        where: {
          deliveryJobId: previous.job.id,
          assignmentId: expiredOffer.id,
          eventType: DeliveryEventType.ASSIGNMENT_EXPIRED,
        },
      }),
    ).not.toBeNull();
  });

  it('prevents active Riders from going offline and concurrent jobs from double-offering one Rider', async () => {
''',
)
