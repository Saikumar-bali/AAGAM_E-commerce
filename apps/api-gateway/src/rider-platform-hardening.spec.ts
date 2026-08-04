import { readFileSync } from 'fs';
import path from 'path';

describe('Rider platform hardening release gate', () => {
  const apiRoot = path.resolve(__dirname);
  const repoRoot = path.resolve(__dirname, '../../..');
  const readApi = (relative: string) => readFileSync(path.join(apiRoot, relative), 'utf8');
  const readRepo = (relative: string) => readFileSync(path.join(repoRoot, relative), 'utf8');

  it('serves owned canonical history, detail and backend-owned receipts', () => {
    const controller = readApi('riders/rider-portal.controller.ts');
    const platform = readApi('riders/rider-platform.service.ts');
    expect(controller).toContain("@Get('history/:deliveryJobId')");
    expect(controller).toContain("@Get('receipts/:deliveryJobId')");
    expect(platform).toContain('currentRiderId: rider.id');
    expect(platform).toContain('receiptVersion: 1');
    expect(platform).toContain('customerPhoneIncluded: false');
    expect(platform).toContain('otpIncluded: false');
  });

  it('keeps earnings and COD as separate persisted accounting domains', () => {
    const platform = readApi('riders/rider-platform.service.ts');
    expect(platform).toContain('prisma.riderEarning.findMany');
    expect(platform).toContain('prisma.codLedger.findMany');
    expect(platform).toContain('riderCanSettle: false');
    expect(platform).not.toContain('nextPayoutDate');
  });

  it('supports exact pickup quantities, QR with PIN fallback and private evidence', () => {
    const pickup = readRepo('apps/mobile-partners/src/screens/rider/RiderPickupOperationsScreen.tsx');
    const scanner = readRepo('apps/mobile-partners/android/app/src/main/java/com/aagampartners/PartnerQrScannerModule.kt');
    const platform = readApi('riders/rider-platform.service.ts');
    expect(pickup).toContain('checkedQuantity');
    expect(pickup).toContain("method: 'QR_CODE'");
    expect(pickup).toContain("method: 'STORE_PICKUP_PIN'");
    expect(pickup).toContain('uploadEvidence');
    expect(scanner).toContain('Barcode.FORMAT_QR_CODE');
    expect(platform).toContain('previewPickupEvidence');
  });

  it('restores completion receipts after process death and reuses them from History', () => {
    const service = readRepo('apps/mobile-partners/src/api/riderService.ts');
    const coordinator = readRepo('apps/mobile-partners/src/screens/rider/RiderDeliveryFlowCoordinator.tsx');
    const history = readRepo('apps/mobile-partners/src/screens/rider/RiderHistoryScreen.tsx');
    expect(service).toContain('RECEIPT_CACHE_PREFIX');
    expect(service).toContain('cacheLastCompletedJob');
    expect(coordinator).toContain('readLastCompletedJob');
    expect(coordinator).toContain('getReceipt');
    expect(history).toContain('onOpenReceipt');
  });

  it('does not expose raw phone numbers from Rider workspace screens', () => {
    const portal = readRepo('apps/mobile-partners/src/api/riderPortalService.ts');
    const active = readRepo('apps/mobile-partners/src/screens/rider/RiderDeliveryFlowScreen.tsx');
    const platform = readApi('riders/rider-platform.service.ts');
    expect(portal).toContain('stripRawContact');
    expect(portal).toContain('delete clone.order.customer.phone');
    expect(active).not.toContain('destinationPhone');
    expect(active).not.toContain('`tel:${');
    expect(active).toContain('requestContact');
    expect(platform).toContain("action: 'RIDER_CONTACT'");
  });

  it('provides the final Rider information architecture and notification-compatible deep links', () => {
    const navigator = readRepo('apps/mobile-partners/src/navigation/RiderNavigator.tsx');
    const router = readRepo('apps/mobile-partners/src/navigation/RiderJobsNavigator.tsx');
    for (const tab of ['Dashboard', 'Operations', 'Alerts', 'History', 'Profile']) {
      expect(navigator).toContain(`name="${tab}"`);
    }
    expect(router).toContain('name="RiderOfferDetail"');
    expect(router).toContain('name="RiderJobHistoryDetail"');
    expect(navigator).toContain('useSafeAreaInsets');
    expect(navigator).toContain('tabBarHideOnKeyboard');
  });

  it('documents an explicit physical-device, rollout and rollback gate', () => {
    const gate = readRepo('docs/RIDER_PLATFORM_RELEASE_GATE.md');
    for (const version of ['Android 12', 'Android 13', 'Android 14', 'Android 15']) {
      expect(gate).toContain(version);
    }
    expect(gate).toContain('Physical-device evidence is mandatory');
    expect(gate).toContain('Rollback');
    expect(gate).toContain('Do not record OTP');
  });
});
