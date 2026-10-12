import { readFileSync } from 'fs';
import path from 'path';

describe('Rider assignment visibility contract', () => {
  const api = (file: string) => readFileSync(path.join(__dirname, file), 'utf8');
  const dashboard = (file: string) =>
    readFileSync(path.join(__dirname, '../../admin-dashboard/src', file), 'utf8');
  const mobile = (file: string) =>
    readFileSync(path.join(__dirname, '../../mobile-partners/src', file), 'utf8');

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
    // Cancelled and skipped deliveries must never inflate the board. The query
    // filters them out (same notIn as dispatch-summary), so assert the filter
    // rather than a per-row guard the query already makes unreachable.
    expect(service).toContain(
      'status: { notIn: [SubscriptionDeliveryStatus.SKIPPED, SubscriptionDeliveryStatus.CANCELLED] }',
    );
  });

  it('surfaces slot timings and cash so the dialog can show real dispatch detail', () => {
    const service = api('subscriptions/store-milk-grid.service.ts');
    expect(service).toContain('slotWindow');
    expect(service).toContain('pickupConfirmedAt');
    expect(service).toContain('cashToCollectPaise');
    expect(service).toContain('cashDuePaise');
    // "Cash to collect" is a due figure: the board must reconcile the ledger
    // with the day cells (a stranded skipped funding day reads 0 per cell while
    // the subscription still owes) instead of summing raw `cashDuePaise`.
    expect(service).toContain('reconcileSubscriptionBalance');
    expect(service).toContain('outstandingDuePaise');
  });

  it('reconciles the Runs tab "cash due" the same way instead of the raw run column', () => {
    const planning = api('subscriptions/delivery-run-planning.service.ts');
    expect(planning).toContain('reconcileSubscriptionBalance');
    expect(planning).toContain('outstandingDuePaise');
    const page = dashboard('app/(store)/store/subscriptions/page.tsx');
    expect(page).toContain('run.outstandingDuePaise ?? run.expectedCashPaise');
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
    // Per-stop chips prefer the reconciled outstanding over the raw day cell.
    expect(dialog).toContain('outstandingDuePaise');
  });

  it('renders the reconciled due on the mobile rider-assignments board too', () => {
    const screen = mobile('screens/store/StoreRiderAssignmentsScreen.tsx');
    // The mobile board is the same surface as the dialog; its per-stop cash chip
    // must read the reconciled outstanding, not the raw day cell, or a stranded
    // due shows ₹0 on mobile while the web dialog shows the real amount.
    expect(screen).toContain('outstandingDuePaise ?? stop.cashDuePaise');
  });
});
