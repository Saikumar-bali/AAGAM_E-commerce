import fs from 'fs';
import path from 'path';

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

describe('Partners notification delivery contracts', () => {
  it('creates the versioned high-priority Android channel backed by the bundled rider alert sound', () => {
    const application = read('../android/app/src/main/java/com/aagampartners/MainApplication.kt');
    const manifest = read('../android/app/src/main/AndroidManifest.xml');
    expect(application).toContain('OPERATIONS_CHANNEL_ID = "aagam_priority_operations_v4"');
    expect(application).toContain('"Aagaam urgent operations"');
    expect(application).toContain('NotificationManager.IMPORTANCE_HIGH');
    // Background/killed-state pushes play the bundled asset, not the device default.
    expect(application).toContain('android.resource://$packageName/${R.raw.rider_alert}');
    expect(application).not.toContain('RingtoneManager.getDefaultUri');
    expect(application).not.toContain('RingtoneManager.TYPE_ALARM');
    expect(application).toContain('AudioAttributes.USAGE_NOTIFICATION_EVENT');
    expect(application).toContain('vibrationPattern = longArrayOf(0, 320, 120, 320, 120, 520, 180, 320)');
    expect(application).toContain('createOperationsNotificationChannel()');
    expect(application).toContain('add(PartnerAlertTonePackage())');
    expect(manifest).toContain('com.google.firebase.messaging.default_notification_channel_id');
    expect(manifest).toContain('android:value="aagam_priority_operations_v4"');
    expect(manifest).not.toContain('android:value="aagam_priority_operations_v3"');
  });

  it('plays the bundled rider alert asset from the single foreground coordinator', () => {
    const app = read('../App.tsx');
    const coordinator = read('notifications/PartnerPushCoordinator.tsx');
    const toneModule = read('../android/app/src/main/java/com/aagampartners/PartnerAlertToneModule.kt');
    expect(app).toContain('<PartnerPushCoordinator queryClient={queryClient} />');
    expect(coordinator).toContain('PartnerAlertTone?.play?.()');
    expect(coordinator).toContain('PartnerAlertTone?.stop?.()');
    expect(coordinator).toContain('startMobilePushLifecycle');
    expect(toneModule).toContain('AudioAttributes.USAGE_NOTIFICATION_EVENT');
    expect(toneModule).toContain('MediaPlayer.create(context, resId)');
    expect(toneModule).toContain('"rider_alert"');
    // The generated tone was replaced by the bundled asset.
    expect(toneModule).not.toContain('ToneGenerator');
    expect(toneModule).not.toContain('TYPE_ALARM');
  });

  it('bundles the rider alert sound asset in android res/raw', () => {
    const asset = fs.readdirSync(path.resolve(__dirname, '../android/app/src/main/res/raw'));
    expect(asset).toContain('rider_alert.wav');
    const bytes = fs.readFileSync(
      path.resolve(__dirname, '../android/app/src/main/res/raw/rider_alert.wav'),
    );
    // A valid RIFF/WAVE header means Android can play it.
    expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString('ascii')).toBe('WAVE');
  });

  it('keeps a durable inbox fallback when FCM registration or delivery is unavailable', () => {
    const coordinator = read('notifications/PartnerPushCoordinator.tsx');
    const routing = read('domain/partnerNotifications.ts');
    expect(coordinator).toContain('notificationService.getInbox(50)');
    expect(coordinator).toContain('INBOX_POLL_MS = 30_000');
    expect(coordinator).toContain('Push setup unavailable');
    expect(coordinator).toContain('notificationDedupeKey(payload)}:opened');
    expect(routing).toContain("['partner-store-orders']");
    expect(routing).toContain("['rider', 'delivery-workspace']");
  });

  it('raises a single, accept-gated offer notification instead of polling repeats', () => {
    const coordinator = read('notifications/PartnerPushCoordinator.tsx');
    const policy = read('domain/partnerAlertPolicy.ts');
    expect(coordinator).toContain('alertKeyForPayload(payload)');
    expect(coordinator).toContain('alertKeysForInboxBootstrap');
    expect(coordinator).toContain('shouldAlertForInboxItem');
    expect(coordinator).toContain('rememberAlert');
    expect(coordinator).toContain('AsyncStorage.getItem(alertedStorageKey)');
    expect(policy).toContain("return `offer:${payload.assignmentId");
    expect(policy).toContain('if (item.readAt || item.openedAt) return false;');
    // The poll loop must never use the old "re-alert the last three unread" burst.
    expect(coordinator).not.toContain('unseen.slice(-3)');
  });

  it('repairs Rider or Store FCM binding without re-prompting notification permission', () => {
    const coordinator = read('notifications/PartnerPushCoordinator.tsx');
    const sharedPush = read('../../../packages/mobile-shared/src/utils/notifications.ts');
    expect(coordinator).toContain('reverifyDeviceTokenBinding');
    expect(coordinator).not.toContain('registerDeviceToken');
    expect(coordinator).toContain('PUSH_STARTUP_RETRY_MS = 30_000');
    expect(coordinator).toContain('PUSH_REVERIFY_MS = 5 * 60_000');
    expect(coordinator).toContain('pushReverifyInFlight');
    expect(coordinator).toContain('pushLifecycleStartInFlight');
    expect(coordinator).toContain('registerMobileSessionCleanup(async () =>');
    expect(coordinator).toContain('await Promise.all([');
    expect(coordinator).toContain("if (state === 'active')");
    expect(coordinator).toContain("role === 'RIDER' ? 'Aagaam Rider' : 'Aagaam Store Partner'");
    expect(sharedPush).toContain('hasExistingNotificationPermission');
    expect(sharedPush).toContain('PermissionsAndroid.check');
    expect(sharedPush).toContain('export async function reverifyDeviceTokenBinding');
    expect(sharedPush).not.toContain('reverifyDeviceTokenBinding(deviceName?: string) {\n  const hasPermission = await requestUserPermission()');
  });

  it('exposes notifications to both Store Owners and Riders', () => {
    const root = read('navigation/RootNavigator.tsx');
    const storeDashboard = read('screens/store/StoreDashboard.tsx');
    const riderNavigator = read('navigation/RiderNavigator.tsx');
    expect(root).toContain('name="Notifications"');
    expect(storeDashboard).toContain('store_dashboard_notifications');
    expect(riderNavigator).toContain('name="Notifications"');
    expect(riderNavigator).not.toContain('tab_alerts');
  });

  it('preserves metadata identifiers and prioritizes Store pickup routing', () => {
    const inbox = read('screens/PartnerNotificationsScreen.tsx');
    const policy = read('domain/partnerAlertPolicy.ts');
    expect(inbox).toContain('item.assignmentId ?? metadata.assignmentId');
    expect(policy).toContain('assignmentId: item.assignmentId ?? metadata.assignmentId');
    expect(inbox.indexOf("eventType === 'RIDER_AT_STORE'")).toBeLessThan(
      inbox.indexOf('if (openTypedWorkspace(item)) return;'),
    );
  });
});
