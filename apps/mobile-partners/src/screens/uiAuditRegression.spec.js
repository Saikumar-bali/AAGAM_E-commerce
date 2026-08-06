const fs = require('fs');
const path = require('path');

const screen = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');
const repoPath = (file) => path.join(__dirname, '../../../../', file);
const repoFile = (file) => fs.readFileSync(repoPath(file), 'utf8');
const repoBinary = (file) => fs.readFileSync(repoPath(file));

describe('partner mobile UI audit regressions', () => {
  it('removes misleading Store header navigation controls', () => {
    expect(screen('store/StoreDashboard.tsx')).not.toContain('<Menu');
    expect(screen('store/StoreOrdersScreen.tsx')).not.toContain('<Menu');
    expect(screen('store/StorePickupAlertsScreen.tsx')).not.toContain('<ArrowLeft');
  });

  it('uses exactly five equal-width Store tabs without a hidden spacer route', () => {
    const navigator = repoFile('apps/mobile-partners/src/navigation/StoreNavigator.tsx');
    expect((navigator.match(/<Tab\.Screen/g) || []).length).toBe(5);
    expect(navigator).toContain('tabBarItemStyle: {');
    expect(navigator).toContain('flex: 1,');
    expect(navigator).not.toContain('tabBarButton: () => null');
    expect(navigator).not.toContain("tabBarStyle: { display: 'none' }");
  });

  it('keeps Store headers separated and uses the dashboard theme on details and More', () => {
    const brand = repoFile('apps/mobile-partners/src/components/AagamBrand.tsx');
    const details = screen('store/StoreOrderDetailsScreen.tsx');
    const settings = screen('store/StoreSettingsScreen.tsx');
    expect(brand).toContain("marginRight: 'auto'");
    expect(details).toContain("backgroundColor: '#057A55'");
    expect(details).toContain("backgroundColor: '#078B4D'");
    expect(settings).toContain("backgroundColor: '#057A55'");
    expect(settings).toContain("backgroundColor: '#078B4D'");
  });

  it('renders the Aagaam artwork full-bleed through one shared mark component', () => {
    const mark = repoFile('apps/mobile-partners/src/components/AagamMark.tsx');
    const brand = repoFile('apps/mobile-partners/src/components/AagamBrand.tsx');
    const login = screen('LoginScreen.tsx');
    const welcome = screen('PartnerWelcomeScreen.tsx');
    const root = repoFile('apps/mobile-partners/src/navigation/RootNavigator.tsx');
    expect(mark).toContain('resizeMode="cover"');
    expect(mark).toContain("overflow: 'hidden'");
    expect(mark).toContain("backgroundColor: '#061B36'");
    expect(mark).not.toContain('resizeMode="contain"');
    expect(brand).toContain('<AagamMark');
    expect(login).toContain('<AagamMark');
    expect(welcome).toContain('<AagamMark');
    expect(root).toContain('<AagamMark');
    expect(login).not.toContain("require('../assets/aagam-mark.png')");
    expect(welcome).not.toContain("require('../assets/aagam-mark.png')");
    expect(root).not.toContain("require('../assets/aagam-mark.png')");
  });

  it('makes direct sign in primary and keeps application choices compact', () => {
    const welcome = screen('PartnerWelcomeScreen.tsx');
    expect(welcome).toContain('Grow with Aagaam');
    expect(welcome).toContain('testID="partner_direct_sign_in"');
    expect(welcome).toContain('Direct sign in');
    expect(welcome).toContain('style={styles.roleRow}');
    expect(welcome).toContain('Delivery Partner');
    expect(welcome).toContain('Store Partner');
    expect(welcome).toContain('Resume application');
    expect(welcome.indexOf('Direct sign in')).toBeLessThan(welcome.indexOf('Delivery Partner'));
    expect(welcome).not.toContain('Deliver orders on your schedule');
    expect(welcome).not.toContain('Sell products and manage incoming');
    expect(welcome).not.toContain('Partner access activates only after verification');
  });

  it('shows email and password together without the protected-access banner', () => {
    const login = screen('LoginScreen.tsx');
    expect(login).toContain("useState<'PHONE' | 'PASSWORD'>('PASSWORD')");
    expect(login).toContain('testID="partner_password_identifier"');
    expect(login).toContain('testID="partner_password_input"');
    expect(login).toContain('secureTextEntry={!passwordVisible}');
    expect(login).toContain('testID="partner_password_visibility"');
    expect(login).toContain('Email & Password');
    expect(login).not.toContain('Protected partner access');
    expect(login).not.toContain('ShieldCheck');
  });

  it('uses one combined rider and store loading screen with the dashboard hero green', () => {
    const root = repoFile('apps/mobile-partners/src/navigation/RootNavigator.tsx');
    const baseStyles = repoFile('apps/mobile-partners/android/app/src/main/res/values/styles.xml');
    const android12Styles = repoFile('apps/mobile-partners/android/app/src/main/res/values-v31/styles.xml');
    expect(root).toContain('Loading Partner Workspace');
    expect(root).toContain('Preparing rider and store tools');
    expect(root).toContain('<Bike');
    expect(root).toContain('<Store');
    expect(root).toContain("backgroundColor: '#057A55'");
    expect(baseStyles).toContain('<item name="android:windowBackground">#057A55</item>');
    expect(android12Styles).toContain('<item name="android:windowSplashScreenBackground">#057A55</item>');
    expect(android12Styles).toContain('@drawable/ic_launcher_foreground');
  });

  it('uses the customer artwork in both Partners launcher and in-app brand assets', () => {
    const customerLauncher = repoBinary('apps/mobile-customer/android/app/src/main/res/drawable-nodpi/ic_launcher_foreground.png');
    const partnerLauncher = repoBinary('apps/mobile-partners/android/app/src/main/res/drawable-nodpi/ic_launcher_foreground.png');
    const customerBrand = repoBinary('apps/mobile-customer/src/assets/aagam-mark.png');
    const partnerBrand = repoBinary('apps/mobile-partners/src/assets/aagam-mark.png');
    expect(partnerLauncher.equals(customerLauncher)).toBe(true);
    expect(partnerBrand.equals(customerBrand)).toBe(true);
  });

  it('places the Aagaam partner brand in all five Rider tab screens', () => {
    for (const file of [
      'rider/RiderDashboard.tsx',
      'rider/RiderJobsScreen.tsx',
      'PartnerNotificationsScreen.tsx',
      'rider/RiderEarningsScreen.tsx',
      'rider/RiderProfileScreen.tsx',
    ]) {
      expect(screen(file)).toContain('PartnerTabBrand');
    }
  });

  it('keeps Store inventory in the green Aagaam workspace theme', () => {
    const inventory = screen('store/StoreInventoryScreen.tsx');
    expect(inventory).toContain('AagamBrand');
    expect(inventory).toContain('caption="Store operations"');
    expect(inventory).toContain('StatusBar');
    expect(inventory).toContain("const BRAND_GREEN = '#057A55'");
    expect(inventory).toContain("const ACTION_GREEN = '#078B4D'");
    expect(inventory).toContain('styles.bodySheet');
    expect(inventory).toContain('testID="inventory_refresh_button"');
  });

  it('uses safe-area insets instead of fixed Rider header padding', () => {
    for (const file of [
      'rider/RiderDashboard.tsx',
      'rider/RiderNotificationSettingsScreen.tsx',
      'rider/RiderTrackingDiagnosticsScreen.tsx',
    ]) {
      const text = screen(file);
      expect(text).toContain('useSafeAreaInsets');
      expect(text).not.toContain('paddingTop: 48');
      expect(text).not.toContain('paddingTop: 52');
    }
  });

  it('navigates once after pickup verification', () => {
    const text = screen('rider/RiderPickupOperationsScreen.tsx');
    expect((text.match(/navigation\.replace\('RiderDelivery'/g) || []).length).toBe(1);
  });

  it('uses the shared Rider workspace cache key', () => {
    const text = screen('rider/RiderJobsScreen.tsx');
    expect(text).toContain('RIDER_WORKSPACE_QUERY_KEY');
    expect(text).not.toContain('const WORKSPACE_KEY');
  });

  it('updates offer countdowns and removes decorative COD chevrons', () => {
    expect(screen('rider/RiderOfferDetailScreen.tsx')).toContain('setInterval');
    expect(screen('rider/RiderCodScreen.tsx')).not.toContain('ChevronRight');
  });

  it('preserves cached Rider operational data on refresh errors', () => {
    const documents = screen('rider/RiderDocumentsScreen.tsx');
    expect(documents).toContain('query.isError && documents.length === 0');
    expect(documents).toContain('Showing your last loaded submissions.');

    const preferences = screen('rider/RiderNotificationSettingsScreen.tsx');
    expect(preferences).toContain('hasCachedPreferences');
    expect(preferences).toContain('Showing your last loaded settings.');

    const account = screen('rider/RiderAccountStatusScreen.tsx');
    expect(account).toContain('query.isError && !hasCachedProfile');
    expect(account).toContain('Showing your last loaded eligibility details.');
  });

  it('keeps Store owner APIs role-safe and URL-safe', () => {
    const text = repoFile('apps/mobile-partners/src/api/storeService.ts');
    expect(text).not.toContain('createStore:');
    expect(text).toContain('encodeURIComponent(orderId)');
    expect(text).toContain('encodeURIComponent(storeId)');
  });

  it('reconnects sockets, exposes reactive state, and preserves one-argument cleanup', () => {
    const text = repoFile('packages/mobile-shared/src/hooks/useSocket.ts');
    expect(text).toContain('reconnection: true');
    expect(text).toContain('useState<Socket | null>');
    expect(text).toContain('if (callback)');
    expect(text).toContain('socket?.off(event);');
    expect(text).not.toContain('socketRef.current');
  });
});
