from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}")
    file.write_text(text.replace(old, new, 1))


replace_once(
    "apps/api-gateway/src/orders/auto-dispatch.service.ts",
    '''  async dispatchWaitingJobs(limitInput = this.reconcileLimit()) {
    if (!this.isEnabled()) return { scanned: 0, offered: 0 };

    const limit = Math.max(1, Math.min(250, Math.floor(limitInput || this.reconcileLimit())));
    const jobs = await prisma.deliveryJob.findMany({
      where: {
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
      },
      select: { id: true },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });

    let offered = 0;
    for (const job of jobs) {
      const outcome = await this.dispatchNearestRider(job.id).catch((error) => {
        this.logger.warn(
          `Waiting-job dispatch failed for ${job.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
      });
      if (outcome?.offered) offered += 1;
    }

    return { scanned: jobs.length, offered };
  }
''',
    '''  async dispatchWaitingJobs(limitInput = this.reconcileLimit()) {
    if (!this.isEnabled()) return { scanned: 0, offered: 0 };

    const offerLimit = Math.max(
      1,
      Math.min(250, Math.floor(limitInput || this.reconcileLimit())),
    );
    const pageSize = Math.max(25, offerLimit);
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

    let scanned = 0;
    let offered = 0;
    let after: { updatedAt: Date; id: string } | null = null;

    while (offered < offerLimit) {
      const jobs = await prisma.deliveryJob.findMany({
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
        take: pageSize,
      });
      if (jobs.length === 0) break;

      for (const job of jobs) {
        scanned += 1;
        const outcome = await this.dispatchNearestRider(job.id).catch((error) => {
          this.logger.warn(
            `Waiting-job dispatch failed for ${job.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
          return null;
        });
        if (outcome?.offered) {
          offered += 1;
          if (offered >= offerLimit) break;
        }
      }

      const last = jobs[jobs.length - 1];
      after = { updatedAt: last.updatedAt, id: last.id };
      if (jobs.length < pageSize) break;
    }

    return { scanned, offered };
  }
''',
)

replace_once(
    "packages/database/prisma/schema.prisma",
    '''  orders                   Order[]
  locationPings            RiderLocationPing[]
  deliveryJobs             DeliveryJob[]               @relation("DeliveryJobCurrentRider")
''',
    '''  orders                   Order[]
  locationPings            RiderLocationPing[]
  availabilityLocation     RiderAvailabilityLocation?
  deliveryJobs             DeliveryJob[]               @relation("DeliveryJobCurrentRider")
''',
)

replace_once(
    "packages/database/prisma/schema.prisma",
    '''  updatedAt                DateTime                    @updatedAt
}

enum OrderStatus {
''',
    '''  updatedAt                DateTime                    @updatedAt
}

model RiderAvailabilityLocation {
  riderProfileId String       @id
  riderProfile   RiderProfile @relation(fields: [riderProfileId], references: [id], onDelete: Cascade)
  latitude       Float
  longitude      Float
  capturedAt     DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  @@index([capturedAt])
}

enum OrderStatus {
''',
)

anchor = '''  it('prevents active Riders from going offline and concurrent jobs from double-offering one Rider', async () => {
'''
regression = '''  it('pages past ineligible waiting jobs instead of starving a later dispatchable job', async () => {
    const blocked = await waiting(`ineligible_${Date.now()}`);
    const target = await waiting(`eligible_${Date.now()}`);
    await prisma.store.update({
      where: { id: blocked.store.id },
      data: { latitude: 18.2, longitude: 83.8 },
    });
    const recovery = await rider('paged_recovery', 'ONLINE', 17.7004, 83.3004);

    const result = await dispatch().dispatchWaitingJobs(1);

    expect(result).toEqual({ scanned: 2, offered: 1 });
    expect(
      await prisma.dispatchAssignment.findFirst({
        where: {
          deliveryJobId: target.job.id,
          riderProfileId: recovery.profile.id,
          status: DispatchAssignmentStatus.OFFERED,
        },
      }),
    ).not.toBeNull();
  });

'''
replace_once(
    "apps/api-gateway/src/auto-dispatch-recovery.e2e.spec.ts",
    anchor,
    regression + anchor,
)

replace_once(
    "apps/api-gateway/src/auto-dispatch-recovery.contract.spec.ts",
    '''    expect(source).toContain('dispatchWaitingJobs');
    expect(source).toContain('assignments: {');
    expect(source).toContain('none: {');
    expect(source).toContain("isolationLevel: 'Serializable'");
  });
''',
    '''    expect(source).toContain('dispatchWaitingJobs');
    expect(source).toContain('while (offered < offerLimit)');
    expect(source).toContain('{ updatedAt: { gt: after.updatedAt } }');
    expect(source).toContain("orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }]");
    expect(source).toContain('assignments: {');
    expect(source).toContain('none: {');
    expect(source).toContain("isolationLevel: 'Serializable'");
  });
''',
)

contract_anchor = '''  it('runs waiting-job recovery from both the notification worker and Rider online transition', () => {
'''
schema_contract = '''  it('keeps the dedicated Rider availability table represented in the Prisma schema', () => {
    const schema = read('packages/database/prisma/schema.prisma');
    expect(schema).toContain('model RiderAvailabilityLocation');
    expect(schema).toContain('availabilityLocation     RiderAvailabilityLocation?');
    expect(schema).toContain('riderProfileId String       @id');
    expect(schema).toContain('@@index([capturedAt])');
  });

'''
replace_once(
    "apps/api-gateway/src/auto-dispatch-recovery.contract.spec.ts",
    contract_anchor,
    schema_contract + contract_anchor,
)
