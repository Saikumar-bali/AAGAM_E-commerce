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

  it('preserves multiple same-day and unavailable schedule windows', () => {
    const value = source('screens/rider/RiderProfileScreen.tsx');
    expect(value).toContain('const hydrated: ScheduleDraft[] = entries.map');
    expect(value).toContain('const presentDays = new Set');
    expect(value).toContain('schedule.map(({ enabled, ...entry })');
    expect(value).not.toContain('.filter((entry) => entry.enabled)');
    expect(value).toContain('entry.startMinute}-${entry.endMinute}-${index}');
    expect(value).toContain('minuteLabel(entry.startMinute)');
  });

  it('guards Firebase listeners when Firebase is unavailable', () => {
    const value = source('screens/rider/RiderDashboard.tsx');
    expect(value).toContain('try {');
    expect(value).toContain('unsubscribeForeground = messaging().onMessage');
    expect(value).toContain('Firebase is optional in local builds');
    expect(value).toContain('unsubscribeForeground?.()');
    expect(value).toContain('unsubscribeOpened?.()');
  });

  it('renders workspace errors before the successful empty state', () => {
    const value = source('screens/rider/RiderDeliveryFlowScreen.tsx');
    expect(value).toContain('Delivery workspace unavailable');
    expect(value).toContain('Retry workspace');
    const errorBranch = value.indexOf('if (workspaceQuery.isError)');
    const emptyBranch = value.indexOf('if (!activeJob) return <Empty', errorBranch);
    expect(errorBranch).toBeGreaterThanOrEqual(0);
    expect(emptyBranch).toBeGreaterThan(errorBranch);
  });
});
