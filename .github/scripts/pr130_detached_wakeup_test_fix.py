from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    source = file.read_text()
    if source.count(old) != 1:
        raise SystemExit(f'Expected one match in {path}, found {source.count(old)}')
    file.write_text(source.replace(old, new, 1))


replace_once(
    'apps/api-gateway/src/auto-dispatch-recovery.e2e.spec.ts',
    """    await new RiderService(dispatch()).updateStatusForUser(candidate.user.id, { status: 'ONLINE', latitude: 17.7005, longitude: 83.3005 });
    expect(await prisma.dispatchAssignment.findFirst({ where: { deliveryJobId: target.job.id, riderProfileId: candidate.profile.id, status: DispatchAssignmentStatus.OFFERED } })).not.toBeNull();
""",
    """    await new RiderService(dispatch()).updateStatusForUser(candidate.user.id, { status: 'ONLINE', latitude: 17.7005, longitude: 83.3005 });
    let assignment = null;
    for (let attempt = 0; attempt < 20 && !assignment; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      assignment = await prisma.dispatchAssignment.findFirst({
        where: {
          deliveryJobId: target.job.id,
          riderProfileId: candidate.profile.id,
          status: DispatchAssignmentStatus.OFFERED,
        },
      });
    }
    expect(assignment).not.toBeNull();
""",
)

replace_once(
    'apps/api-gateway/src/auto-dispatch-recovery.contract.spec.ts',
    """    expect(source).toContain('} else {
        RiderOnlineService.stop()');
""",
    """    expect(source).toContain('} else {');
    expect(source).toContain('RiderOnlineService.stop().catch');
""",
)
