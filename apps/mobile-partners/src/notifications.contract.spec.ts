import fs from 'fs';
import path from 'path';

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

describe('Partners notification delivery contracts', () => {
  it('creates the versioned high-priority Android channel used by Firebase partner pushes', () => {
    const application = read('../android/app/src/main/java/com/aagampartners/MainApplication.kt');
    const manifest = read('../android/app/src/main/AndroidManifest.xml');
    expect(application).toContain('OPERATIONS_CHANNEL_ID = "aagam_priority_operations_v2"');
    expect(application).toContain('"Aagaam priority operations"');
    expect(application).toContain('NotificationManager.IMPORTANCE_HIGH');
    expect(application).toContain('RingtoneManager.TYPE_ALARM');
    expect(application).toContain('AudioAttributes.USAGE_NOTIFICATION_EVENT');
    expect(application).toContain('vibrationPattern = longArrayOf(0, 180, 100, 180, 100, 280)');
    expect(application).toContain('createOperationsNotificationChannel()');
    expect(application).toContain('add(PartnerAlertTonePackage())');
    expect(manifest).toContain('com.google.firebase.messaging.default_notification_channel_id');
    expect(manifest).toContain('android:value="aagam_priority_operations_v2"');
    expect(manifest).not.toContain('android:value="aagaam_priority_operations_v2"');
  });

  it('plays the same distinctive alert from the single foreground coordinator', () => {
    const app = read('../App.tsx');
    const coordinator = read('notifications/PartnerPushCoordinator.tsx');
    const toneModule = read('../android/app/src/main/java/com/aagampartners/PartnerAlertToneModule.kt');
    expect(app).toContain('<PartnerPushCoordinator queryClient={queryClient} />');
    expect(coordinator).toContain('PartnerAlertTone?.play?.()');
    expect(coordinator).toContain('PartnerAlertTone?.stop?.()');
    expect(coordinator).toContain('startMobilePushLifecycle');
    expect(toneModule).toContain('RingtoneManager.TYPE_ALARM');
    expect(toneModule).toContain('ringtone.play()');
    expect(toneModule).toContain('4500');
  });

  it('keeps a durable inbox fallback when FCM registration or delivery is unavailable', () => {
    const coordinator = read('notifications/PartnerPushCoordinator.tsx');
    const routing = read('domain/partnerNotifications.ts');
    expect(coordinator).toContain('notificationService.getInbox(50)');
    expect(coordinator).toContain('INBOX_POLL_MS = 10_000');
    expect(coordinator).toContain('Push setup unavailable');
    expect(coordinator).toContain('notificationDedupeKey(payload)}:opened');
    expect(routing).toContain("['partner-store-orders']");
    expect(routing).toContain("['rider', 'delivery-workspace']");
  });

  it('exposes notifications to both Store Owners and Riders', () => {
    const root = read('navigation/RootNavigator.tsx');
    const storeDashboard = read('screens/store/StoreDashboard.tsx');
    const riderNavigator = read('navigation/RiderNavigator.tsx');
    expect(root).toContain('name="Notifications"');
    expect(storeDashboard).toContain('store_dashboard_notifications');
    expect(riderNavigator).toContain('name="Alerts"');
    expect(riderNavigator).toContain('tab_alerts');
  });
});
