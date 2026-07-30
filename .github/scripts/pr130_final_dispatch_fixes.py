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
    '''        // A heartbeat may arrive while the Rider is fulfilling a delivery. It
        // refreshes the dedicated availability location but cannot overwrite
        // the server-owned BUSY state.
        const effectiveStatus =
          data.status === 'ONLINE' && activeJob ? 'BUSY' : data.status;
''',
    '''        // Heartbeats refresh GPS only. They cannot overwrite BUSY, whether
        // BUSY comes from an active delivery or an explicit administrator action.
        const preserveServerBusy =
          data.heartbeat === true &&
          data.status === 'ONLINE' &&
          existing?.status === 'BUSY';
        const effectiveStatus =
          data.status === 'ONLINE' && (activeJob || preserveServerBusy)
            ? 'BUSY'
            : data.status;
''',
)


auto_dispatch = 'apps/api-gateway/src/orders/auto-dispatch.service.ts'
replace_once(
    auto_dispatch,
    '''        const [activeJob, otherOpenOffer] = await Promise.all([
          tx.deliveryJob.findFirst({
            where: {
              currentRiderId: rider.id,
              status: { in: ACTIVE_JOB_STATUSES as any },
            },
            select: { id: true },
          }),
          tx.dispatchAssignment.findFirst({
            where: {
              deliveryJobId: { not: input.deliveryJobId },
              riderProfileId: rider.id,
              status: DispatchAssignmentStatus.OFFERED,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            select: { id: true },
          }),
        ]);
        if (activeJob || otherOpenOffer) return null;
''',
    '''        // Candidate eligibility and the partial unique index must agree.
        // Reconcile expired OFFERED rows while this Rider's availability row is
        // locked, then check for a genuinely live offer before inserting.
        const offerCheckAt = new Date();
        const expiredOffers = await tx.dispatchAssignment.findMany({
          where: {
            riderProfileId: rider.id,
            status: DispatchAssignmentStatus.OFFERED,
            expiresAt: { lt: offerCheckAt },
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
              expiresAt: { lt: offerCheckAt },
            },
            data: {
              status: DispatchAssignmentStatus.EXPIRED,
              respondedAt: offerCheckAt,
            },
          });
          if (changed.count !== 1) continue;
          await this.events.record(
            {
              deliveryJobId: expiredOffer.deliveryJobId,
              assignmentId: expiredOffer.id,
              eventType: DeliveryEventType.ASSIGNMENT_EXPIRED,
              actor: { id: null, role: Role.ADMIN },
              metadata: {
                source: 'AUTO_DISPATCH_CANDIDATE_RECONCILER',
                riderProfileId: expiredOffer.riderProfileId,
                expiresAt: expiredOffer.expiresAt?.toISOString() || null,
              },
            },
            tx,
          );
        }

        const activeJob = await tx.deliveryJob.findFirst({
          where: {
            currentRiderId: rider.id,
            status: { in: ACTIVE_JOB_STATUSES as any },
          },
          select: { id: true },
        });
        const otherOpenOffer = await tx.dispatchAssignment.findFirst({
          where: {
            deliveryJobId: { not: input.deliveryJobId },
            riderProfileId: rider.id,
            status: DispatchAssignmentStatus.OFFERED,
            OR: [{ expiresAt: null }, { expiresAt: { gt: offerCheckAt } }],
          },
          select: { id: true },
        });
        if (activeJob || otherOpenOffer) return null;
''',
)


e2e = 'apps/api-gateway/src/auto-dispatch-recovery.e2e.spec.ts'
replace_once(
    e2e,
    "import { DeliveryJobStatus, DispatchAssignmentStatus } from '@aagam/types';\n",
    "import { DeliveryEventType, DeliveryJobStatus, DispatchAssignmentStatus } from '@aagam/types';\n",
)
replace_once(
    e2e,
    '''  it('prevents active Riders from going offline and concurrent jobs from double-offering one Rider', async () => {
''',
    '''  it('preserves an administrator-set BUSY status during Rider heartbeats', async () => {
    const target = await waiting(`admin_busy_${Date.now()}`);
    const candidate = await rider('admin_busy', 'ONLINE', 17.7003, 83.3003);
    await prisma.riderProfile.update({
      where: { id: candidate.profile.id },
      data: { status: 'BUSY' },
    });

    const service = new RiderService(dispatch());
    await expect(
      service.updateStatusForUser(candidate.user.id, {
        status: 'ONLINE',
        heartbeat: true,
        latitude: 17.7004,
        longitude: 83.3004,
      }),
    ).resolves.toMatchObject({ status: 'BUSY' });
    await expect(
      prisma.riderProfile.findUnique({ where: { id: candidate.profile.id } }),
    ).resolves.toMatchObject({ status: 'BUSY' });
    await expect(dispatch().dispatchNearestRider(target.job.id)).resolves.toMatchObject({
      offered: false,
      reason: 'NO_FRESH_AVAILABLE_RIDER',
    });
  });

  it('reconciles a Rider expired offer before creating the next offer', async () => {
    const previous = await waiting(`expired_previous_${Date.now()}`);
    const target = await waiting(`expired_target_${Date.now()}`);
    const candidate = await rider('expired_candidate', 'ONLINE', 17.7003, 83.3003);
    const expiredAt = new Date(Date.now() - 1_000);
    const expiredOffer = await prisma.dispatchAssignment.create({
      data: {
        deliveryJobId: previous.job.id,
        riderProfileId: candidate.profile.id,
        status: DispatchAssignmentStatus.OFFERED,
        offeredAt: new Date(Date.now() - 61_000),
        expiresAt: expiredAt,
      },
    });

    await expect(dispatch().dispatchNearestRider(target.job.id)).resolves.toMatchObject({
      offered: true,
      riderProfileId: candidate.profile.id,
    });
    await expect(
      prisma.dispatchAssignment.findUnique({ where: { id: expiredOffer.id } }),
    ).resolves.toMatchObject({ status: DispatchAssignmentStatus.EXPIRED });
    await expect(
      prisma.dispatchAssignment.count({
        where: {
          riderProfileId: candidate.profile.id,
          status: DispatchAssignmentStatus.OFFERED,
        },
      }),
    ).resolves.toBe(1);
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
