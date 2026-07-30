from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    source = file.read_text()
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:180]!r}")
    file.write_text(source.replace(old, new, 1))


service = 'apps/api-gateway/src/orders/dispatch-assignment.service.ts'
replace_once(
    service,
    '''                eventType: DeliveryEventType.ASSIGNMENT_EXPIRED,
                actor,
                metadata: {
                  source: 'MANUAL_DISPATCH_RIDER_RECONCILER',
''',
    '''                eventType: DeliveryEventType.ASSIGNMENT_EXPIRED,
                actor: { id: null, role: Role.ADMIN },
                metadata: {
                  source: 'MANUAL_DISPATCH_RIDER_RECONCILER',
''',
)


e2e = 'apps/api-gateway/src/auto-dispatch-recovery.e2e.spec.ts'
replace_once(
    e2e,
    '''    expect(
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
    '''    await expect(
      prisma.deliveryEvent.findFirst({
        where: {
          deliveryJobId: previous.job.id,
          assignmentId: expiredOffer.id,
          eventType: DeliveryEventType.ASSIGNMENT_EXPIRED,
        },
      }),
    ).resolves.toMatchObject({
      actorUserId: null,
      actorRole: Role.ADMIN,
    });
  });

  it('prevents active Riders from going offline and concurrent jobs from double-offering one Rider', async () => {
''',
)
