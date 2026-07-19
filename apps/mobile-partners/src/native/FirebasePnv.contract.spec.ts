import fs from 'node:fs';
import path from 'node:path';

const sourceRoot = path.resolve(__dirname, '..');
const appRoot = path.resolve(sourceRoot, '..');
const screen = fs.readFileSync(
  path.join(sourceRoot, 'screens/PartnerVerificationScreen.tsx'),
  'utf8',
);
const nativeModule = fs.readFileSync(
  path.join(appRoot, 'android/app/src/main/java/com/aagampartners/FirebasePnvModule.kt'),
  'utf8',
);

describe('Firebase PNV Android verification contracts', () => {
  it('PNV supported flow checks support and starts verification', () => {
    expect(screen).toContain('FirebasePnv.isPnvSupported()');
    expect(screen).toContain('FirebasePnv.startPnvVerification(challenge.data.nonce)');
  });

  it('PNV unsupported offers a provider-neutral SMS fallback', () => {
    expect(screen).toContain('setShowSmsFallback(!supported)');
    expect(screen).toContain('Use SMS code');
    expect(screen).not.toContain('Use SMS verification instead');
  });

  it('native consent cancellation is recoverable without exposing internal codes in production UI', () => {
    expect(nativeModule).toContain('GetCredentialCancellationException');
    expect(nativeModule).toContain('PNV_DECLINED');
    expect(screen).toContain("setShowSmsFallback(true)");
    expect(screen).toContain("Alert.alert('Phone verification unavailable'");
    expect(screen).not.toContain("'PNV_DECLINED'");
  });

  it('backend rejection never marks the client verified', () => {
    const verifyCall = screen.indexOf('/phone-pnv/verify');
    const refreshCall = screen.indexOf('await refresh()', verifyCall);
    const navigationCall = screen.indexOf('proceedAfterVerification()', refreshCall);
    expect(verifyCall).toBeGreaterThan(-1);
    expect(refreshCall).toBeGreaterThan(verifyCall);
    expect(navigationCall).toBeGreaterThan(refreshCall);
  });

  it('successful backend confirmation refreshes application state', () => {
    expect(screen).toContain('await apiClient.post(');
    expect(screen).toContain('await refresh();');
  });

  it('QA test session is debug-only and runtime supplied', () => {
    expect(nativeModule).toContain('if (!BuildConfig.DEBUG)');
    expect(nativeModule).toContain('testNumberId: String');
    expect(nativeModule).not.toMatch(/enableTestSession\("[^"$]+"\)/);
  });
});
