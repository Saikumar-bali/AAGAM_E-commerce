from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:80]!r}")
    file.write_text(text.replace(old, new, 1))


# 1. Bound and rotate waiting-job sweeps, and measure retry cooldown from the
# assignment's latest status transition rather than offer creation.
dispatch_path = Path('apps/api-gateway/src/orders/auto-dispatch.service.ts')
dispatch = dispatch_path.read_text()
replace_marker = "  private readonly logger = new Logger(AutoDispatchService.name);\n"
if dispatch.count(replace_marker) != 1:
    raise SystemExit('Could not locate AutoDispatchService logger')
dispatch = dispatch.replace(
    replace_marker,
    replace_marker
    + "  private waitingSweepCursor: { updatedAt: Date; id: string } | null = null;\n",
    1,
)

limit_method = """  private reconcileLimit() {
    return Math.floor(this.numberEnv('AUTO_DISPATCH_RECONCILE_LIMIT', 50, 1, 250));
  }
"""
scan_method = limit_method + """
  private reconcileScanLimit(offerLimit: number) {
    return Math.floor(
      this.numberEnv(
        'AUTO_DISPATCH_RECONCILE_SCAN_LIMIT',
        Math.max(offerLimit, offerLimit * 10),
        offerLimit,
        5_000,
      ),
    );
  }
"""
if dispatch.count(limit_method) != 1:
    raise SystemExit('Could not locate reconcileLimit')
dispatch = dispatch.replace(limit_method, scan_method, 1)

start = dispatch.index('  async dispatchWaitingJobs(')
end = dispatch.index('\n  async dispatchNearestRider(', start)
new_sweep = """  async dispatchWaitingJobs(limitInput = this.reconcileLimit()) {
    if (!this.isEnabled()) return { scanned: 0, offered: 0 };

    const offerLimit = Math.max(
      1,
      Math.min(250, Math.floor(limitInput || this.reconcileLimit())),
    );
    const scanLimit = this.reconcileScanLimit(offerLimit);
    const pageSize = Math.min(100, scanLimit);
    const baseWhere: Prisma.DeliveryJobWhereInput = {
      status: DeliveryJobStatus.WAITING_FOR_DISPATCH,
      currentRiderId: null,
      assignments: {
        none: {
          status: {
            in: [
              DispatchAssignmentStatus.OFFERED,
              DispatchAssignmentStatus.ACCEPTED,
            ],
          },
        },
      },
    };

    const startingCursor = this.waitingSweepCursor;
    const seenIds = new Set<string>();
    let after = startingCursor;
    let wrapped = false;
    let scanned = 0;
    let offered = 0;

    sweep: while (offered < offerLimit && scanned < scanLimit) {
      const take = Math.min(pageSize, scanLimit - scanned);
      const jobs: Array<{ id: string; updatedAt: Date }> =
        await prisma.deliveryJob.findMany({
          where: {
            ...baseWhere,
            ...(after
              ? {
                  OR: [
                    { updatedAt: { gt: after.updatedAt } },
                    { updatedAt: after.updatedAt, id: { gt: after.id } },
                  ],
                }
              : {}),
          },
          select: { id: true, updatedAt: true },
          orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
          take,
        });

      if (jobs.length === 0) {
        if (!wrapped && startingCursor) {
          after = null;
          wrapped = true;
          continue;
        }
        break;
      }

      for (const job of jobs) {
        if (seenIds.has(job.id)) break sweep;
        seenIds.add(job.id);
        scanned += 1;
        after = { updatedAt: job.updatedAt, id: job.id };
        this.waitingSweepCursor = after;

        const outcome = await this.dispatchNearestRider(job.id).catch((error) => {
          this.logger.warn(
            `Waiting-job dispatch failed for ${job.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
          return null;
        });
        if (outcome?.offered) offered += 1;
        if (offered >= offerLimit || scanned >= scanLimit) break sweep;
      }

      if (jobs.length < take) {
        if (!wrapped && startingCursor) {
          after = null;
          wrapped = true;
          continue;
        }
        break;
      }
    }

    return { scanned, offered };
  }
"""
dispatch = dispatch[:start] + new_sweep + dispatch[end:]
old_cooldown = "          createdAt: { gte: retryCutoff },"
new_cooldown = "          updatedAt: { gte: retryCutoff },"
if dispatch.count(old_cooldown) != 1:
    raise SystemExit('Could not locate retry cutoff field')
dispatch = dispatch.replace(old_cooldown, new_cooldown, 1)
dispatch_path.write_text(dispatch)

# 2. Add database-backed regressions for response-time cooldown and bounded
# cursor rotation.
e2e_path = Path('apps/api-gateway/src/auto-dispatch-recovery.e2e.spec.ts')
e2e = e2e_path.read_text()
anchor = "  it('prevents active Riders from going offline and concurrent jobs from double-offering one Rider', async () => {\n"
if e2e.count(anchor) != 1:
    raise SystemExit('Could not locate E2E insertion anchor')
regressions = """  it('starts Rider retry cooldown when an offer is answered', async () => {
    const target = await waiting(`cooldown_${Date.now()}`);
    const nearest = await rider('cooldown_nearest', 'ONLINE', 17.7001, 83.3001);
    const fallback = await rider('cooldown_fallback', 'ONLINE', 17.705, 83.305);
    const old = new Date(Date.now() - 120_000);
    const assignment = await prisma.dispatchAssignment.create({
      data: {
        deliveryJobId: target.job.id,
        riderProfileId: nearest.profile.id,
        status: DispatchAssignmentStatus.OFFERED,
        offeredAt: old,
        expiresAt: new Date(old.getTime() + 60_000),
        createdAt: old,
      },
    });
    await prisma.dispatchAssignment.update({
      where: { id: assignment.id },
      data: {
        status: DispatchAssignmentStatus.EXPIRED,
        respondedAt: new Date(),
      },
    });

    await expect(dispatch().dispatchNearestRider(target.job.id)).resolves.toMatchObject({
      offered: true,
      riderProfileId: fallback.profile.id,
    });
  });

  it('bounds each sweep and resumes from its persistent waiting-job cursor', async () => {
    const previous = process.env.AUTO_DISPATCH_RECONCILE_SCAN_LIMIT;
    process.env.AUTO_DISPATCH_RECONCILE_SCAN_LIMIT = '2';
    try {
      const firstBlocked = await waiting(`bounded_a_${Date.now()}`);
      const secondBlocked = await waiting(`bounded_b_${Date.now()}`);
      const target = await waiting(`bounded_target_${Date.now()}`);
      await prisma.store.updateMany({
        where: { id: { in: [firstBlocked.store.id, secondBlocked.store.id] } },
        data: { latitude: 18.2, longitude: 83.8 },
      });
      const recovery = await rider('bounded_recovery', 'ONLINE', 17.7004, 83.3004);
      const service = dispatch();

      await expect(service.dispatchWaitingJobs(1)).resolves.toEqual({ scanned: 2, offered: 0 });
      await expect(service.dispatchWaitingJobs(1)).resolves.toEqual({ scanned: 1, offered: 1 });
      expect(
        await prisma.dispatchAssignment.findFirst({
          where: {
            deliveryJobId: target.job.id,
            riderProfileId: recovery.profile.id,
            status: DispatchAssignmentStatus.OFFERED,
          },
        }),
      ).not.toBeNull();
    } finally {
      if (previous === undefined) delete process.env.AUTO_DISPATCH_RECONCILE_SCAN_LIMIT;
      else process.env.AUTO_DISPATCH_RECONCILE_SCAN_LIMIT = previous;
    }
  });

"""
e2e_path.write_text(e2e.replace(anchor, regressions + anchor, 1))

# 3. Strengthen source contracts for scan bounds, response-time cooldown, and
# logout heartbeat cleanup.
contract_path = Path('apps/api-gateway/src/auto-dispatch-recovery.contract.spec.ts')
contract = contract_path.read_text()
contract = contract.replace(
    "    expect(source).toContain('AUTO_DISPATCH_RETRY_COOLDOWN_SECONDS');\n",
    "    expect(source).toContain('AUTO_DISPATCH_RETRY_COOLDOWN_SECONDS');\n"
    "    expect(source).toContain('AUTO_DISPATCH_RECONCILE_SCAN_LIMIT');\n"
    "    expect(source).toContain('waitingSweepCursor');\n"
    "    expect(source).toContain('scanned < scanLimit');\n"
    "    expect(source).toContain('updatedAt: { gte: retryCutoff }');\n"
    "    expect(source).not.toContain('createdAt: { gte: retryCutoff }');\n",
    1,
)
logout_anchor = "  it('shows active automatic offers and locks duplicate manual assignment in the admin board', () => {\n"
logout_contract = """  it('stops the Rider availability heartbeat before signing out', () => {
    const source = read(
      'apps/mobile-partners/src/screens/rider/RiderProfileScreen.tsx',
    );
    expect(source).toContain('await RiderOnlineService.stop()');
    expect(source).toContain('await logout()');
    expect(source.indexOf('await RiderOnlineService.stop()')).toBeLessThan(
      source.indexOf('await logout()'),
    );
  });

"""
if contract.count(logout_anchor) != 1:
    raise SystemExit('Could not locate contract insertion anchor')
contract_path.write_text(contract.replace(logout_anchor, logout_contract + logout_anchor, 1))

# 4. Stop foreground GPS/availability activity before clearing authentication.
profile_path = Path('apps/mobile-partners/src/screens/rider/RiderProfileScreen.tsx')
profile = profile_path.read_text()
profile = profile.replace(
    "import { useAuthStore } from '@aagam/mobile-shared';\n",
    "import { useAuthStore } from '@aagam/mobile-shared';\n"
    "import { RiderOnlineService } from '../../services/RiderOnlineService';\n",
    1,
)
profile = profile.replace(
    "  const initial = (user?.name || user?.email || 'R').slice(0, 1).toUpperCase();\n",
    "  const initial = (user?.name || user?.email || 'R').slice(0, 1).toUpperCase();\n\n"
    "  const handleLogout = async () => {\n"
    "    await RiderOnlineService.stop().catch(() => false);\n"
    "    await logout();\n"
    "  };\n",
    1,
)
profile = profile.replace(
    "Availability and active delivery controls remain on the Dashboard tab. Signing out deactivates only this device's push subscription.",
    "Availability and active delivery controls remain on the Dashboard tab. Signing out stops this device's Rider availability heartbeat and deactivates its push subscription.",
    1,
)
profile = profile.replace(
    "<TouchableOpacity style={styles.logoutButton} onPress={() => void logout()}>",
    "<TouchableOpacity style={styles.logoutButton} onPress={() => void handleLogout()}>",
    1,
)
profile_path.write_text(profile)
