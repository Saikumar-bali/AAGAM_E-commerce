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
contains(toast, 'shouldSkipGlobalErrorToast', 'Expected API branches must be able to avoid misleading global feedback.');
contains(toast, 'config?.skipGlobalToast === true', 'Callers must have a generic global-toast opt-out.');
contains(toast, "status === 404", 'The expected missing LOGIN identity response must be recognized.');
contains(toast, "payload?.purpose === 'LOGIN'", 'Only the LOGIN-to-SIGNUP fallback lookup may suppress its 404 toast.');
contains(toast, "window.addEventListener('aagam:toast'", 'Internal web events must retain the existing AAGAM namespace.');
excludes(toast, "window.addEventListener('aagaam:toast'", 'The Aagaam spelling change must remain presentation-only.');

const partnerReview = read('apps/admin-dashboard/src/app/(admin)/admin/partner-applications/page.tsx');
contains(partnerReview, 'const toast = useToast()', 'Partner review actions must use toast feedback.');
contains(partnerReview, "toast.success(success, 'Partner review updated')", 'Successful partner actions must show confirmation.');
excludes(partnerReview, 'setError(', 'Partner review errors must not be rendered as inline page banners.');
excludes(partnerReview, 'window.alert(', 'Partner document feedback must use modern toast UI.');

const webPhoneGuard = read('apps/admin-dashboard/src/components/TenDigitPhoneGuard.tsx');
contains(webPhoneGuard, 'input.maxLength = 10', 'Web login must enforce a ten-digit phone field.');
contains(webPhoneGuard, ".replace(/\\D/g, '').slice(0, 10)", 'Web login must discard non-digits and excess digits.');
contains(webPhoneGuard, "target.inputMode === 'numeric'", 'The guard must continue recognizing the field after configuring numeric input mode.');
contains(webPhoneGuard, "target.dataset.aagamPhoneGuard === 'true'", 'The configured login field must keep a stable internal identity.');

for (const path of [
  'apps/mobile-customer/src/screens/LoginScreen.tsx',
  'apps/mobile-partners/src/screens/LoginScreen.tsx',
]) {
  const source = read(path);
  contains(source, "const digits = value.replace(/\\D/g, '')", `${path} must sanitize phone input.`);
  contains(source, "digits.length === 11 && digits.startsWith('0')", `${path} must normalize an exact Indian trunk prefix.`);
  contains(source, "digits.length === 12 && digits.startsWith('91')", `${path} must normalize an exact Indian country prefix.`);
  contains(source, 'return digits;', `${path} must preserve unsupported lengths so validation rejects them.`);
  excludes(source, 'return nationalDigits.slice(0, 10)', `${path} must not silently truncate unsupported overlong values.`);
  contains(source, 'maxLength={13}', `${path} must allow a complete +91 autofill value before normalization.`);
  contains(source, 'phone.length !== 10', `${path} must keep the action disabled unless state has exactly ten digits.`);
  contains(source, 'nationalNumber.length !== 10', `${path} must reject non-ten-digit values before the API call.`);
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

const adminNotifications = read('apps/admin-dashboard/src/app/(admin)/admin/notifications/page.tsx');
contains(adminNotifications, 'AAGAAM broadcast placeholder message', 'Controlled admin form values must display the Aagaam brand.');
excludes(adminNotifications, 'AAGAM broadcast placeholder message', 'Controlled admin form values must not expose legacy branding.');

const map = read('apps/admin-dashboard/src/components/CustomerTrackingMap.tsx');
contains(map, 'const focusMarkers = riderMarker && deliveryMarker', 'Tracking map must focus on rider-to-customer movement.');
contains(map, 'zoom: 16', 'Tracking map must use a close-range default zoom.');
contains(map, 'maxZoom: 16', 'Tracking bounds must not zoom out farther than the intended delivery view.');

const application = read('apps/mobile-partners/android/app/src/main/java/com/aagampartners/MainApplication.kt');
const manifest = read('apps/mobile-partners/android/app/src/main/AndroidManifest.xml');
const pushSender = read('apps/api-gateway/src/notifications/web-push.service.ts');
const foregroundTone = read('apps/mobile-partners/android/app/src/main/java/com/aagampartners/PartnerAlertToneModule.kt');
const partnerApp = read('apps/mobile-partners/App.tsx');
contains(application, 'OPERATIONS_CHANNEL_ID = "aagam_priority_operations_v2"', 'Partner alerts must retain the internal AAGAM namespace.');
contains(application, '"Aagaam priority operations"', 'The visible Android channel name must use the Aagaam brand.');
excludes(application, 'OPERATIONS_CHANNEL_ID = "aagaam_priority_operations_v2"', 'The UI rename must not migrate internal channel identifiers.');
contains(application, 'RingtoneManager.TYPE_ALARM', 'Partner alerts must use a distinctive audible tone.');
contains(application, 'NotificationManager.IMPORTANCE_HIGH', 'Partner alerts must remain high priority.');
contains(application, 'add(PartnerAlertTonePackage())', 'The foreground tone module must be registered with React Native.');
contains(manifest, 'android:value="aagam_priority_operations_v2"', 'Firebase must use the internal AAGAM partner alert channel id.');
excludes(manifest, 'android:value="aagaam_priority_operations_v2"', 'Firebase identifiers must not be renamed for display branding.');
contains(pushSender, "channelId: 'aagam_priority_operations_v2'", 'Background FCM pushes must target the versioned partner alert channel.');
excludes(pushSender, "channelId: 'high_priority_orders'", 'Background FCM pushes must not bypass the new sound profile.');
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
