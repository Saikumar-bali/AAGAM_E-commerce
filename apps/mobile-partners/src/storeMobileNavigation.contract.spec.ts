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
  const subscriptionsHub = source('./screens/store/StoreSubscriptionsHubScreen.tsx');
  const storeNavigator = source('./navigation/StoreNavigator.tsx');

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
    expect(dashboard).toContain('title="Orders"');
    expect(dashboard).toContain('value={String(totals.orders)}');
    expect(dashboard).toContain('subtitle="All time"');
  });

  it('provides actionable notification settings and store-location context', () => {
    expect(settings).toContain("Linking.sendIntent('android.settings.APP_NOTIFICATION_SETTINGS'");
    expect(settings).toContain('testID="store_settings_coordinates"');
    expect(settings).toContain('testID="store_settings_notifications"');
  });

  it('exposes Subscriptions as a first-class store tab wired to real subscription data', () => {
    expect(storeNavigator).toContain('name="Subscriptions"');
    expect(storeNavigator).toContain('StoreSubscriptionsHubScreen');
    expect(storeNavigator).toContain('tabBarButtonTestID: \'tab_subscriptions\'');
    expect(subscriptionsHub).toContain('subscriptionOperationsService.getSubscriberSnapshot');
    expect(subscriptionsHub).toContain('subscriptionOperationsService.getPlans');
    expect(subscriptionsHub).toContain("navigation.navigate('StoreSubscribers')");
    expect(subscriptionsHub).toContain("navigation.navigate('StoreMilkGrid')");
  });

  it('renders the redesigned dashboard hero with the shared gradient surface', () => {
    expect(dashboard).toContain("import { GradientSurface");
    expect(dashboard).toContain('preset="hero"');
    expect(dashboard).toContain('revenueByStore');
    expect(dashboard).toContain('Assigned Stores');
  });
});
