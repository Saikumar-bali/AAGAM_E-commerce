import { readFileSync } from 'fs';
import { resolve } from 'path';

const read = (relative: string) =>
  readFileSync(resolve(__dirname, relative), 'utf8');

describe('Stale empty run does not pin a Rider BUSY', () => {
  const riderService = read('rider.service.ts');
  const operations = read('../subscriptions/regional-route-operations.service.ts');
  const controller = read('../subscriptions/regional-routing.controller.ts');

  it('excludes empty routes from the admin workload payload', () => {
    expect(riderService).toContain('select: { riderId: true, totalStopCount: true, _count: { select: { stops: true } } }');
    expect(riderService).toContain('if (row._count.stops === 0 && row.totalStopCount === 0) continue;');
  });

  it('cancels stale empty runs while releasing a BUSY rider', () => {
    expect(riderService).toContain('const emptyRunIds = activeRuns');
    expect(riderService).toContain('activeRuns.length - emptyRunIds.length');
  });

  it('offers an audited admin path to cancel a started but empty route', () => {
    expect(operations).toContain('async forceCancelEmptyRun');
    expect(operations).toContain('hasLiveStops');
    expect(operations).toContain('DELIVERY_RUN_FORCE_CANCELLED');
    expect(controller).toContain("@Post('runs/:runId/force-cancel')");
    expect(controller).toContain('this.operations.forceCancelEmptyRun(runId, body, request.user);');
  });
});
