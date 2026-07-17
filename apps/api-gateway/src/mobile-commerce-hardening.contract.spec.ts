import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

describe("Mobile commerce hardening contracts", () => {
  test("checkout preserves cart totals and removes internal offer copy", () => {
    const cart = read("apps/admin-dashboard/src/hooks/useCart.ts");
    const checkout = read(
      "apps/admin-dashboard/src/app/(shop)/shop/checkout/page.tsx"
    );

    expect(cart).toContain("aagam:cart-changed");
    expect(cart).toContain("isLoaded");
    expect(checkout).toContain("quote?.invoice.subtotal ?? totalPrice");
    expect(checkout).not.toContain(
      "Automatic offers are evaluated by the server. Code offers are checked against cart, account, store, schedule, and usage limits."
    );
  });

  test("customer address selection exposes a draggable map pin", () => {
    const picker = read(
      "apps/admin-dashboard/src/components/customer/CustomerLocationPicker.tsx"
    );
    const checkout = read(
      "apps/admin-dashboard/src/app/(shop)/shop/checkout/page.tsx"
    );

    expect(picker).toContain("<MapContainer");
    expect(picker).toContain("draggable");
    expect(picker).toContain("dragend");
    expect(checkout).toContain("Use live location");
    expect(checkout).toContain("CustomerLocationPicker");
  });

  test("authenticated web shell is session-deduplicated and mounts web push", () => {
    const layout = read(
      "apps/admin-dashboard/src/components/DashboardLayout.tsx"
    );
    const worker = read(
      "apps/admin-dashboard/public/firebase-messaging-sw.js"
    );

    expect(layout).toContain("let cachedSession");
    expect(layout).toContain("let sessionRequest");
    expect(layout).toContain("<PushNotificationManager />");
    expect(worker).toContain("firebase.messaging");
    expect(worker).toContain("onBackgroundMessage");
  });

  test("customer and partner apps register FCM devices after authentication", () => {
    const shared = read("packages/mobile-shared/src/utils/notifications.ts");
    const customerApp = read("apps/mobile-customer/App.tsx");
    const partnerApp = read("apps/mobile-partners/App.tsx");
    const customerIndex = read("apps/mobile-customer/index.js");
    const partnerIndex = read("apps/mobile-partners/index.js");

    expect(shared).toContain("provider: 'FCM_MOBILE'");
    expect(shared).toContain("POST_NOTIFICATIONS");
    expect(customerApp).toContain("startMobilePushLifecycle('AAGAM Customer'");
    expect(partnerApp).toContain("startMobilePushLifecycle(deviceName");
    expect(customerIndex).toContain("setupBackgroundMessageHandler");
    expect(partnerIndex).toContain("setupBackgroundMessageHandler");
  });

  test("rider sticky tracking and auditable POD are both wired", () => {
    const foregroundService = read(
      "apps/mobile-partners/android/app/src/main/java/com/aagampartners/RiderTrackingService.kt"
    );
    const podScreen = read(
      "apps/mobile-partners/src/screens/rider/RiderDeliveryOperationsScreen.tsx"
    );
    const podApi = read(
      "apps/mobile-partners/src/api/deliveryOperationsService.ts"
    );

    expect(foregroundService).toContain("startForeground");
    expect(foregroundService).toContain("START_STICKY");
    expect(foregroundService).toContain("setOngoing(true)");
    expect(podScreen).toContain("capturePodLocation");
    expect(podScreen).toContain("riderConfirmed: true");
    expect(podScreen).toContain("accuracyMetres");
    expect(podApi).toContain("proofType: 'CUSTOMER_OTP_PIN'");
  });

  test("store mobile settings are implemented rather than a placeholder", () => {
    const navigator = read(
      "apps/mobile-partners/src/navigation/StoreNavigator.tsx"
    );
    const settings = read(
      "apps/mobile-partners/src/screens/store/StoreSettingsScreen.tsx"
    );

    expect(navigator).toContain("StoreSettingsScreen");
    expect(settings).toContain("storeService.updateStore");
    expect(settings).not.toContain("coming soon");
  });

  test("new admin coupons are customer-visible or explicitly scheduled", () => {
    const controller = read(
      "apps/api-gateway/src/promotions/promotions.controller.ts"
    );

    expect(controller).toContain("CouponStatus.DRAFT");
    expect(controller).toContain("CouponStatus.ACTIVE");
    expect(controller).toContain("CouponStatus.SCHEDULED");
  });

  test("Android builds validate the real signing certificate without JSON mutation", () => {
    const workflow = read(".github/workflows/android-apk-release.yml");
    const signing = read("scripts/prepare-android-google-auth.sh");

    expect(workflow).toContain("prepare-android-google-auth.sh");
    expect(workflow).toContain("google-signin-proof.md");
    expect(workflow).not.toContain("jq --arg sha1");
    expect(workflow).not.toContain("keytool -genkey");
    expect(signing).toContain("SIGNING_CERT_SHA1");
    expect(signing).toContain("DEBUG_KEYSTORE_BASE64 is missing");
  });
});
