import fs from 'fs';
import path from 'path';

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

describe('Partners notification delivery contracts', () => {
  it('creates the Android channel used by Firebase order and rider pushes', () => {
    const application = read('../android/app/src/main/java/com/aagampartners/MainApplication.kt');
    const manifest = read('../android/app/src/main/AndroidManifest.xml');
    expect(application).toContain('OPERATIONS_CHANNEL_ID = "high_priority_orders"');
    expect(application).toContain('NotificationManager.IMPORTANCE_HIGH');
    expect(application).toContain('createOperationsNotificationChannel()');
    expect(manifest).toContain('com.google.firebase.messaging.default_notification_channel_id');
    expect(manifest).toContain('android:value="high_priority_orders"');
  });

  it('keeps a durable inbox fallback when FCM registration or delivery is unavailable', () => {
    const app = read('../App.tsx');
    expect(app).toContain('notificationService.getInbox(50)');
    expect(app).toContain('setInterval(() => void pollInbox(), 10_000)');
    expect(app).toContain('Push notification setup unavailable');
    expect(app).toContain("queryKey: ['partner-store-orders']");
    expect(app).toContain("queryKey: ['rider', 'delivery-workspace']");
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
