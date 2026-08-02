from pathlib import Path
import re
import textwrap


def read(path: str) -> str:
    return Path(path).read_text(encoding='utf-8')


def write(path: str, content: str) -> None:
    Path(path).write_text(content, encoding='utf-8')


def replace_once(path: str, old: str, new: str, label: str) -> None:
    source = read(path)
    if old not in source:
        raise SystemExit(f'{label}: source pattern not found in {path}')
    write(path, source.replace(old, new, 1))


def replace_regex(path: str, pattern: str, replacement: str, label: str) -> None:
    source = read(path)
    updated, count = re.subn(pattern, replacement, source, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'{label}: expected one match in {path}, found {count}')
    write(path, updated)


def block(value: str, indent: int = 0) -> str:
    return textwrap.indent(textwrap.dedent(value).strip('\n'), ' ' * indent)


# 1. Point the store badge at the route registered by StoreOrdersController.
replace_once(
    'apps/mobile-partners/src/api/storeService.ts',
    "apiClient.get('/store-owner/store-orders/summary/pending-count')",
    "apiClient.get('/store-owner/orders/summary/pending-count')",
    'pending-order badge route',
)

# 2. Preserve every same-day availability window and every disabled window.
profile = 'apps/mobile-partners/src/screens/rider/RiderProfileScreen.tsx'
replace_once(
    profile,
    block('''
function paise(value: unknown) {
  return `₹${(Number(value || 0) / 100).toFixed(2)}`;
}
'''),
    block('''
function paise(value: unknown) {
  return `₹${(Number(value || 0) / 100).toFixed(2)}`;
}

function minuteLabel(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
'''),
    'availability time formatter',
)
replace_regex(
    profile,
    r"  useEffect\(\(\) => \{\n    const entries = Array\.isArray\(availability\.schedule\) \? availability\.schedule : \[\];\n.*?\n  \}, \[availabilityQuery\.data\]\);",
    block('''
useEffect(() => {
  const entries = Array.isArray(availability.schedule) ? availability.schedule : [];
  if (!entries.length) {
    setSchedule(defaultSchedule());
    return;
  }

  const hydrated = entries.map((row: any) => ({
    dayOfWeek: Number(row.dayOfWeek),
    startMinute: Number(row.startMinute),
    endMinute: Number(row.endMinute),
    isAvailable: Boolean(row.isAvailable),
    enabled: Boolean(row.isAvailable),
  }));
  const presentDays = new Set(hydrated.map((entry) => entry.dayOfWeek));
  const missingDays = defaultSchedule().filter((entry) => !presentDays.has(entry.dayOfWeek));
  setSchedule(
    [...hydrated, ...missingDays].sort(
      (left, right) => left.dayOfWeek - right.dayOfWeek || left.startMinute - right.startMinute,
    ),
  );
}, [availabilityQuery.data]);
''', 2),
    'availability hydration',
)
replace_regex(
    profile,
    r"    mutationFn: \(\) => riderService\.updateAvailabilitySchedule\(\n      schedule\n        \.filter\(\(entry\) => entry\.enabled\)\n        \.map\(\(\{ enabled: _enabled, \.\.\.entry \}\) => entry\),\n    \),",
    block('''
mutationFn: () => riderService.updateAvailabilitySchedule(
  schedule.map(({ enabled, ...entry }) => ({
    ...entry,
    isAvailable: enabled,
  })),
),
''', 4),
    'availability save payload',
)
replace_once(
    profile,
    '<View key={entry.dayOfWeek} style={styles.row}>',
    '<View key={`${entry.dayOfWeek}-${entry.startMinute}-${entry.endMinute}-${index}`} style={styles.row}>',
    'availability row key',
)
replace_once(
    profile,
    "<Text style={styles.rowText}>{entry.enabled ? '09:00 – 18:00' : 'Unavailable'}</Text>",
    "<Text style={styles.rowText}>{entry.enabled ? `${minuteLabel(entry.startMinute)} – ${minuteLabel(entry.endMinute)}` : 'Unavailable'}</Text>",
    'availability window label',
)

# 3. Guard direct Firebase listeners when local builds have no default Firebase app.
dashboard = 'apps/mobile-partners/src/screens/rider/RiderDashboard.tsx'
old_push_effect = block('''
useEffect(() => {
  let alive = true;
  let unsubscribePushLifecycle: (() => void) | undefined;
  void startMobilePushLifecycle('Aagaam Partners').then((unsubscribe) => {
    if (alive) unsubscribePushLifecycle = unsubscribe;
    else unsubscribe();
  }).catch(() => undefined);

  const openNotification = (message: any) => {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY }),
      queryClient.invalidateQueries({ queryKey: PARTNER_NOTIFICATION_QUERY_KEY }),
    ]);
    if (message?.data?.deliveryJobId || message?.data?.orderId) navigation?.navigate?.('Operations');
    else navigation?.navigate?.('Alerts');
  };
  const unsubscribeForeground = messaging().onMessage(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY }),
      queryClient.invalidateQueries({ queryKey: PARTNER_NOTIFICATION_QUERY_KEY }),
    ]);
    Toast.show({ type: 'info', text1: 'New rider update', text2: 'Your job queue has been refreshed.' });
  });
  const unsubscribeOpened = messaging().onNotificationOpenedApp(openNotification);
  void messaging().getInitialNotification().then((message) => {
    if (message) openNotification(message);
  });
  return () => {
    alive = false;
    unsubscribePushLifecycle?.();
    unsubscribeForeground();
    unsubscribeOpened();
  };
}, [navigation, queryClient]);
''', 2)
new_push_effect = block('''
useEffect(() => {
  let alive = true;
  let unsubscribePushLifecycle: (() => void) | undefined;
  let unsubscribeForeground: (() => void) | undefined;
  let unsubscribeOpened: (() => void) | undefined;
  void startMobilePushLifecycle('Aagaam Partners').then((unsubscribe) => {
    if (alive) unsubscribePushLifecycle = unsubscribe;
    else unsubscribe();
  }).catch(() => undefined);

  const openNotification = (message: any) => {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY }),
      queryClient.invalidateQueries({ queryKey: PARTNER_NOTIFICATION_QUERY_KEY }),
    ]);
    if (message?.data?.deliveryJobId || message?.data?.orderId) navigation?.navigate?.('Operations');
    else navigation?.navigate?.('Alerts');
  };
  try {
    unsubscribeForeground = messaging().onMessage(async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY }),
        queryClient.invalidateQueries({ queryKey: PARTNER_NOTIFICATION_QUERY_KEY }),
      ]);
      Toast.show({ type: 'info', text1: 'New rider update', text2: 'Your job queue has been refreshed.' });
    });
    unsubscribeOpened = messaging().onNotificationOpenedApp(openNotification);
    void messaging().getInitialNotification().then((message) => {
      if (message) openNotification(message);
    }).catch(() => undefined);
  } catch (_error) {
    // Firebase is optional in local builds without google-services.json.
  }
  return () => {
    alive = false;
    unsubscribePushLifecycle?.();
    unsubscribeForeground?.();
    unsubscribeOpened?.();
  };
}, [navigation, queryClient]);
''', 2)
replace_once(dashboard, old_push_effect, new_push_effect, 'guarded Firebase listeners')

# 4. Distinguish workspace outages from a successful empty workspace.
delivery = 'apps/mobile-partners/src/screens/rider/RiderDeliveryFlowScreen.tsx'
replace_once(
    delivery,
    block('''
if (workspaceQuery.isLoading) return <Loading label="Loading active delivery…" />;
if (!activeJob) return <Empty onRefresh={() => void refresh()} />;
''', 2),
    block('''
if (workspaceQuery.isLoading) return <Loading label="Loading active delivery…" />;
if (workspaceQuery.isError) {
  return (
    <WorkspaceError
      error={workspaceQuery.error}
      onRetry={() => void workspaceQuery.refetch()}
    />
  );
}
if (!activeJob) return <Empty onRefresh={() => void refresh()} />;
''', 2),
    'workspace failure branch',
)
replace_once(
    delivery,
    block('''
function Empty({ onRefresh }: { onRefresh: () => void }) {
'''),
    block('''
function WorkspaceError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <View style={styles.loading}>
      <AlertTriangle size={48} color="#B91C1C" />
      <Text style={styles.emptyTitle}>Delivery workspace unavailable</Text>
      <Text style={styles.hint}>{errorMessage(error)}</Text>
      <TouchableOpacity style={styles.secondaryButton} onPress={onRetry}>
        <RefreshCw size={18} color="#0F766E" /><Text style={styles.secondaryText}>Retry workspace</Text>
      </TouchableOpacity>
    </View>
  );
}

function Empty({ onRefresh }: { onRefresh: () => void }) {
'''),
    'workspace error component',
)

# Source-level regression coverage complements the service-level failure-key tests.
spec = Path('apps/mobile-partners/src/domain/pr167FinalReviewFixes.spec.ts')
spec.write_text("""import fs from 'fs';
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
    expect(value).toContain('const hydrated = entries.map');
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
    expect(value.indexOf('workspaceQuery.isError')).toBeLessThan(value.indexOf('if (!activeJob)'));
  });
});
""", encoding='utf-8')

print('Applied final PR 167 Codex fixes and regression coverage.')
