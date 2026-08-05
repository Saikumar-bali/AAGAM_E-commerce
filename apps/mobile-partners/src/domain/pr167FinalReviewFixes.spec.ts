import fs from 'fs';
import path from 'path';

function source(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');
}

describe('PR 167 final Codex regressions', () => {
  it('uses the registered pending-order aggregate route', () => {
    const value = source('api/storeService.ts');
    expect(value).toContain("/store-owner/orders/summary/pending-count");
    expect(value).not.toContain("/store-owner/store-orders/summary/pending-count");
  });

  it('preserves multiple same-day and unavailable schedule windows in the dedicated schedule screen', () => {
    const value = source('screens/rider/RiderScheduleScreen.tsx');
    expect(value).toContain('setEntries(schedule.map');
    expect(value).toContain('isAvailable: Boolean(entry.isAvailable)');
    expect(value).toContain('entries.filter((entry) => entry.dayOfWeek === day)');
    expect(value).toContain('entries.map(({ localId: _localId, ...entry }) => entry)');
    expect(value).not.toContain('.filter((entry) => entry.enabled)');
    expect(value).toContain('key={entry.localId}');
    expect(value).toContain('minutesLabel(entry.startMinute)');
  });

  it('guards the centralized Firebase lifecycle when Firebase is unavailable', () => {
    const value = source('notifications/PartnerPushCoordinator.tsx');
    const dashboard = source('screens/rider/RiderDashboard.tsx');
    expect(value).toContain('try {');
    expect(value).toContain('openedCleanup = messaging().onNotificationOpenedApp');
    expect(value).toContain('Local builds without Firebase still use the inbox fallback');
    expect(value).toContain('pushCleanup();');
    expect(value).toContain('openedCleanup();');
    expect(value).toContain('startMobilePushLifecycle');
    expect(dashboard).not.toContain('messaging().onMessage');
    expect(dashboard).not.toContain('startMobilePushLifecycle');
  });

  it('renders workspace errors before the authoritative empty state', () => {
    const value = source('screens/rider/RiderDeliveryFlowScreen.tsx');
    expect(value).toContain('Active delivery unavailable');
    expect(value).toContain('No active delivery');
    const errorBranch = value.indexOf('if (workspaceQuery.isError)');
    const emptyBranch = value.indexOf('if (!activeJob) return <State', errorBranch);
    expect(errorBranch).toBeGreaterThanOrEqual(0);
    expect(emptyBranch).toBeGreaterThan(errorBranch);
  });
});
