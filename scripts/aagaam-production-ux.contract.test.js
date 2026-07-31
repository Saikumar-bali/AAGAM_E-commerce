const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');

const root = resolve(__dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const contains = (source, expected, message) => assert.ok(source.includes(expected), `${message}\nMissing: ${expected}`);
const excludes = (source, expected, message) => assert.ok(!source.includes(expected), `${message}\nUnexpected: ${expected}`);

const toast = read('apps/admin-dashboard/src/components/ToastProvider.tsx');
contains(toast, 'apiClient.interceptors.response.use', 'Web API failures must be surfaced globally.');
contains(toast, 'z-[200]', 'Toast feedback must render above review dialogs.');
contains(toast, "status === 409", 'Conflict responses must receive a useful title.');

const partnerReview = read('apps/admin-dashboard/src/app/(admin)/admin/partner-applications/page.tsx');
contains(partnerReview, 'const toast = useToast()', 'Partner review actions must use toast feedback.');
contains(partnerReview, "toast.success(success, 'Partner review updated')", 'Successful partner actions must show confirmation.');
excludes(partnerReview, 'setError(', 'Partner review errors must not be rendered as inline page banners.');
excludes(partnerReview, 'window.alert(', 'Partner document feedback must use modern toast UI.');

const webPhoneGuard = read('apps/admin-dashboard/src/components/TenDigitPhoneGuard.tsx');
contains(webPhoneGuard, 'input.maxLength = 10', 'Web login must enforce a ten-digit phone field.');
contains(webPhoneGuard, ".replace(/\\D/g, '').slice(0, 10)", 'Web login must discard non-digits and excess digits.');

for (const path of [
  'apps/mobile-customer/src/screens/LoginScreen.tsx',
  'apps/mobile-partners/src/screens/LoginScreen.tsx',
]) {
  const source = read(path);
  contains(source, ".replace(/\\D/g, '').slice(0, 10)", `${path} must sanitize phone input.`);
  contains(source, 'maxLength={10}', `${path} must cap mobile input at ten digits.`);
  contains(source, "`+91${digitsOnly(value)}`", `${path} must format the national number only at the API boundary.`);
}

const dashboardLayout = read('apps/admin-dashboard/src/components/DashboardLayout.tsx');
contains(dashboardLayout, '<AagamLogo', 'Responsive admin header must include the shared logo.');
contains(dashboardLayout, '<PushNotificationManager onOpen={openNotifications} compact />', 'Admin header must expose one unified notification control.');
excludes(dashboardLayout, '<Bell ', 'Admin header must not render a duplicate standalone bell.');
contains(dashboardLayout, 'md:hidden', 'Admin search must have a compact mobile trigger.');

const adminHome = read('apps/admin-dashboard/src/app/(admin)/admin/page.tsx');
for (const href of ['/admin/stores', '/admin/riders', '/admin/orders', '/admin/analytics']) {
  contains(adminHome, `href: '${href}'`, `Dashboard metric must navigate to ${href}.`);
}

const account = read('apps/admin-dashboard/src/app/(shop)/shop/account/page.tsx');
excludes(account, 'profile.role', 'Customer account must not expose an unnecessary role label.');
contains(account, 'Account status', 'Customer account should show useful account status instead.');

const map = read('apps/admin-dashboard/src/components/CustomerTrackingMap.tsx');
contains(map, 'const focusMarkers = riderMarker && deliveryMarker', 'Tracking map must focus on rider-to-customer movement.');
contains(map, 'zoom: 16', 'Tracking map must use a close-range default zoom.');
contains(map, 'maxZoom: 16', 'Tracking bounds must not zoom out farther than the intended delivery view.');

const application = read('apps/mobile-partners/android/app/src/main/java/com/aagampartners/MainApplication.kt');
const manifest = read('apps/mobile-partners/android/app/src/main/AndroidManifest.xml');
const foregroundTone = read('apps/mobile-partners/android/app/src/main/java/com/aagampartners/PartnerAlertToneModule.kt');
const partnerApp = read('apps/mobile-partners/App.tsx');
contains(application, 'OPERATIONS_CHANNEL_ID = "aagaam_priority_operations_v2"', 'Partner alerts must use a versioned channel.');
contains(application, 'RingtoneManager.TYPE_ALARM', 'Partner alerts must use a distinctive audible tone.');
contains(application, 'NotificationManager.IMPORTANCE_HIGH', 'Partner alerts must remain high priority.');
contains(application, 'add(PartnerAlertTonePackage())', 'The foreground tone module must be registered with React Native.');
contains(manifest, 'android:value="aagaam_priority_operations_v2"', 'Firebase must use the Aagaam partner alert channel.');
contains(foregroundTone, 'ringtone.play()', 'Foreground notifications must play the partner alert tone.');
contains(partnerApp, 'PartnerAlertTone?.play?.()', 'Foreground FCM and inbox alerts must invoke the native tone.');
contains(partnerApp, 'PartnerAlertTone?.stop?.()', 'The alert tone must stop during lifecycle cleanup.');

const welcome = read('apps/mobile-partners/src/screens/PartnerWelcomeScreen.tsx');
contains(welcome, 'Grow with Aagaam', 'Partner onboarding must use the new production brand copy.');
excludes(welcome, 'Alert.alert(', 'Partner onboarding must avoid debug-style native alert dialogs.');

for (const path of [
  'apps/admin-dashboard/src/components/AagamLogo.tsx',
  'apps/mobile-customer/src/components/AagamBrand.tsx',
  'apps/mobile-partners/src/components/AagamBrand.tsx',
]) {
  contains(read(path), 'Aagaam', `${path} must display the Aagaam brand.`);
}

console.log('Aagaam production UX contracts passed.');
