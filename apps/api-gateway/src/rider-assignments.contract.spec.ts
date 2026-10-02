import { readFileSync } from 'fs';
import path from 'path';

describe('Rider assignment visibility contract', () => {
  const api = (file: string) => readFileSync(path.join(__dirname, file), 'utf8');
  const dashboard = (file: string) =>
    readFileSync(path.join(__dirname, '../../admin-dashboard/src', file), 'utf8');

  it('exposes a store-scoped rider-assignments endpoint on the subscriptions controller', () => {
    const controller = api('subscriptions/subscriptions.controller.ts');
    expect(controller).toContain("@Controller('store/subscriptions')");
    expect(controller).toContain("@Get('rider-assignments')");
    expect(controller).toContain('getRiderAssignments(req.user, date)');
  });

  it('groups assigned stops by the rider that owns the run and buckets the rest as unassigned', () => {
    const service = api('subscriptions/store-milk-grid.service.ts');
    expect(service).toContain('async getRiderAssignments(');
    // Assignment is derived from the run stop's rider, so a delivery is only
    // "assigned" once it is linked to a rider-owned run.
    expect(service).toContain('d.runStop?.deliveryRun');
    expect(service).toContain('riderMap.set(rider.id, riderEntry)');
    expect(service).toContain('unassigned.push(stop)');
    expect(service).toContain('assigned: assignedCount');
    expect(service).toContain('unassigned: unassignedCount');
    // Cancelled deliveries must never inflate the board.
    expect(service).toContain("if (d.status === 'CANCELLED') continue;");
  });

  it('surfaces slot timings and cash so the dialog can show real dispatch detail', () => {
    const service = api('subscriptions/store-milk-grid.service.ts');
    expect(service).toContain('slotWindow');
    expect(service).toContain('pickupConfirmedAt');
    expect(service).toContain('cashToCollectPaise');
    expect(service).toContain('cashDuePaise');
  });

  it('links a dispatch to the rider run and the order so it is visible everywhere', () => {
    const service = api('subscriptions/store-milk-grid.service.ts');
    // A dispatch must always leave a run stop behind, and must move an existing
    // planning stop onto the rider's run instead of silently leaving it behind.
    expect(service).toContain('deliveryRunStop.create');
    expect(service).toContain('movedFromRunId: stop.deliveryRunId');
    expect(service).toContain('riderId: rider.id');
    expect(service).toContain('riderAssignedAt: new Date()');
    expect(service).toContain("status: 'RIDER_ASSIGNED'");
  });

  it('reports a real pending run count per rider instead of undefined', () => {
    const service = api('subscriptions/store-milk-grid.service.ts');
    expect(service).toContain('async getAvailableRiders(');
    expect(service).toContain('prisma.deliveryRun.groupBy');
    expect(service).toContain('pendingRunCount: countByRider.get(r.id) ?? 0');
  });

  it('replaces the Tomorrow Prep entry point with a rider assignments dialog', () => {
    const page = dashboard('app/(store)/store/subscriptions/page.tsx');
    expect(page).toContain('RiderAssignmentsDialog');
    expect(page).toContain('Rider Assignments');
    expect(page).toContain('setRiderBoardOpen(true)');
    expect(page).not.toContain('> Tomorrow Prep</button>');
  });

  it('dialog fetches the assignments endpoint and shows riders plus unassigned', () => {
    const dialog = dashboard('components/RiderAssignmentsDialog.tsx');
    expect(dialog).toContain("'/store/subscriptions/rider-assignments'");
    expect(dialog).toContain('Rider Assignments');
    expect(dialog).toContain('Unassigned');
    expect(dialog).toContain('cashToCollectPaise');
  });
});
