import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function source(path: string) {
  return readFileSync(resolve(__dirname, path), 'utf8');
}

describe('Store mobile navigation and fulfillment contract', () => {
  const dashboard = source('./screens/store/StoreDashboard.tsx');
  const orders = source('./screens/store/StoreOrdersScreen.tsx');
  const pickupAlerts = source('./screens/store/StorePickupAlertsScreen.tsx');
  const settings = source('./screens/store/StoreSettingsScreen.tsx');
  const ordersNavigator = source('./navigation/StoreOrdersNavigator.tsx');
  const orderDetails = source('./screens/store/StoreOrderDetailsScreen.tsx');

  it('keeps bottom-tab headers free of misleading menu and back actions', () => {
    expect(dashboard).not.toContain('<Menu');
    expect(dashboard).not.toContain('Open more options');
    expect(orders).not.toContain('<Menu');
    expect(orders).not.toContain('Open dashboard');
    expect(pickupAlerts).not.toContain('<ArrowLeft');
    expect(pickupAlerts).not.toContain("navigate('StoreTabs', { screen: 'Dashboard' })");
  });

  it('opens the actionable fulfillment screen from the default order-details route', () => {
    expect(ordersNavigator).toContain('<Stack.Screen name="OrderDetails" component={StoreOrderDetailsScreen} />');
    expect(orderDetails).toContain("{ status: 'CONFIRMED', label: 'Accept order' }");
    expect(orderDetails).toContain("{ status: 'PICKING', label: 'Start preparing' }");
    expect(orderDetails).toContain("{ status: 'PACKED', label: 'Ready for pickup' }");
    expect(orderDetails).toContain('testID={`store_order_action_${action.status.toLowerCase()}`}');
  });

  it('uses the shared root navigation ref for notification bells', () => {
    for (const screen of [dashboard, orders, pickupAlerts]) {
      expect(screen).toContain("partnerNavigationRef.navigate('Notifications')");
      expect(screen).toContain('partnerNavigationRef.isReady()');
      expect(screen).not.toContain('getParent?.()?.getParent');
    }
  });

  it('clearly distinguishes the dashboard historical count from the pending badge', () => {
    expect(dashboard).toContain('title="Orders" value={String(totals.orders)} subtitle="All time"');
  });

  it('provides actionable notification settings and store-location context', () => {
    expect(settings).toContain("Linking.sendIntent('android.settings.APP_NOTIFICATION_SETTINGS'");
    expect(settings).toContain('testID="store_settings_coordinates"');
    expect(settings).toContain('testID="store_settings_notifications"');
  });
});
