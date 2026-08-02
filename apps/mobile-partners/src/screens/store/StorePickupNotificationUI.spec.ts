import fs from 'fs';
import path from 'path';

const read = (relativePath: string) => fs.readFileSync(path.join(__dirname, relativePath), 'utf8');
const dashboard = read('./StoreDashboard.tsx');
const navigator = read('../../navigation/StoreNavigator.tsx');
const details = read('./StoreOrderDetailsScreen.tsx');
const operations = read('./StoreDeliveryOperationsScreen.tsx');
const service = read('../../api/deliveryOperationsService.ts');
const app = read('../../../App.tsx');

describe('Store rider-arrival pickup UX contracts', () => {
  it('listens for foreground, opened-app and cold-start Firebase events', () => {
    expect(dashboard).toContain("import messaging from '@react-native-firebase/messaging';");
    expect(dashboard).toContain('messaging().onMessage');
    expect(dashboard).toContain('messaging().onNotificationOpenedApp');
    expect(dashboard).toContain('messaging().getInitialNotification');
    expect(dashboard).toContain("eventType !== 'RIDER_AT_STORE'");
    expect(dashboard).toContain('Toast.show');
  });

  it('refreshes the canonical pickup queue and shows the dashboard alert banner', () => {
    expect(service).toContain("STORE_DELIVERY_OPERATIONS_QUERY_KEY = ['store', 'delivery-operations']");
    expect(dashboard).toContain('STORE_DELIVERY_OPERATIONS_QUERY_KEY');
    expect(dashboard).toContain("job.status === 'RIDER_AT_STORE'");
    expect(dashboard).toContain('store_dashboard_pickup_banner');
    expect(dashboard).toContain('Tap to verify parcel handoff');
    expect(dashboard).toContain("navigateToStorePickup(navigation)");
  });

  it('exposes a red Operations badge from the same live queue', () => {
    expect(navigator).toContain('useQuery');
    expect(navigator).toContain('tabBarBadge');
    expect(navigator).toContain("job.status === 'RIDER_AT_STORE'");
    expect(navigator).toContain("backgroundColor: '#DC2626'");
    expect(operations).toContain('STORE_DELIVERY_OPERATIONS_QUERY_KEY');
  });

  it('deep-links an order detail rider-arrival state to pickup verification', () => {
    expect(details).toContain("order?.status === 'RIDER_AT_STORE'");
    expect(details).toContain('store_order_verify_pickup');
    expect(details).toContain("storeNavigator.navigate('StorePickupVerification')");
    expect(details).toContain('PackageCheck');
  });

  it('keeps the app-level opened/cold-start router aligned with the store deep link', () => {
    expect(app).toContain("eventType === 'RIDER_AT_STORE'");
    expect(app).toContain("screen: 'StorePickupVerification'");
  });
});
