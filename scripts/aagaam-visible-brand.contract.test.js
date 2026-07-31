const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');

const root = resolve(__dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const forbidden = {
  'apps/admin-dashboard/src/lib/pushNotifications.ts': ["'AAGAM update'"],
  'apps/admin-dashboard/src/app/(admin)/admin/stores/page.tsx': ['Aagam Commerce Operations'],
  'apps/admin-dashboard/src/app/page.tsx': ['Aagam combines customer storefront', 'Aagam Command', "'Aagam offer'", '© 2026 Aagam Commerce OS', 'Deliver with Aagam', 'href="/login">Customer support'],
  'apps/admin-dashboard/src/app/(shop)/shop/orders/[id]/page.tsx': ['ordering with Aagam.'],
  'apps/admin-dashboard/src/app/(shop)/shop/delivery-code/[deliveryJobId]/page.tsx': ['AAGAM staff should never ask'],
  'apps/admin-dashboard/src/components/Sidebar.tsx': ['"Aagam Customer"'],
  'apps/mobile-customer/src/ui/CustomerToast.tsx': ["text1 || 'AAGAM'"],
  'apps/mobile-customer/src/screens/customer/CheckoutScreen.tsx': ['AAGAM uses precise location'],
  'apps/mobile-customer/src/components/promotions/PromotionCarousel.tsx': ['Published offers from Aagam'],
  'apps/mobile-partners/src/onboarding/applicationReviewProgress.ts': ['Submitted to AAGAM'],
  'apps/mobile-partners/src/screens/PartnerVerificationScreen.tsx': ['AAGAM never asks you'],
  'apps/mobile-partners/src/screens/PartnerActivationScreen.tsx': ['AAGAM Admin cannot view'],
  'apps/mobile-partners/src/screens/StoreApplicationScreen.tsx': ['AAGAM uses this one-time location', 'Join AAGAM as a Store'],
  'apps/mobile-partners/src/screens/PartnerDocumentsScreen.tsx': ['ready for AAGAM review'],
  'apps/mobile-partners/src/screens/RiderApplicationScreen.tsx': ['AAGAM uses your location', 'Become an AAGAM Rider', 'Contact AAGAM operations.'],
  'apps/mobile-partners/src/screens/rider/RiderDashboard.tsx': ["'AAGAM store'", "startMobilePushLifecycle('AAGAM Partners')", 'AAGAM Partners uses precise location', 'AAGAM PARTNERS'],
  'apps/mobile-partners/src/screens/rider/RiderDeliveryOperationsScreen.tsx': ['“AAGAM delivery tracking active”', "'AAGAM Store'"],
  'apps/mobile-partners/src/screens/rider/RiderProfileScreen.tsx': ['AAGAM PARTNERS', "'AAGAM Rider'"],
  'apps/mobile-partners/src/screens/rider/RiderPickupOperationsScreen.tsx': ["'AAGAM store'"],
  'apps/mobile-partners/src/screens/PartnerApplicationStartScreen.tsx': ['primary AAGAM login'],
  'apps/mobile-partners/android/app/src/main/java/com/aagampartners/RiderTrackingService.kt': ['setContentTitle("AAGAM delivery tracking active")'],
  'apps/mobile-partners/android/app/src/main/java/com/aagampartners/RiderOnlineService.kt': ['setContentTitle("AAGAM — You are online")'],
};
for (const [path, values] of Object.entries(forbidden)) {
  const source = read(path);
  for (const value of values) assert.ok(!source.includes(value), `${path} still exposes legacy visible branding: ${value}`);
}
assert.ok(read('apps/admin-dashboard/src/app/page.tsx').includes('href="/shop/support">Customer support'), 'The public Customer support link must open the implemented support workspace.');
assert.ok(read('apps/mobile-partners/android/app/src/main/java/com/aagampartners/PartnerDocumentPickerModule.kt').includes('Pictures/AAGAM Partners'), 'The existing internal Android media path must remain unchanged.');
assert.ok(read('apps/mobile-partners/android/app/src/main/AndroidManifest.xml').includes('aagam_priority_operations_v2'), 'The internal notification channel ID must remain unchanged.');
console.log('Aagaam visible brand contracts passed.');
