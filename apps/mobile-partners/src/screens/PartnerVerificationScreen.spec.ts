import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(
  path.join(__dirname, 'PartnerVerificationScreen.tsx'),
  'utf8',
);

describe('PartnerVerificationScreen contracts', () => {
  it('protects verification with the application session token', () => {
    expect(source).toContain('if (!applicationId || !accessToken)');
    expect(source).toContain('Application session unavailable');
    expect(source).toContain('Authorization: `Application ${token}`');
    expect(source).toContain('resetVerificationToPartnerHome(navigation)');
  });

  it('accepts only a sanitized six-digit verification code', () => {
    expect(source).toContain("if (!/^\\d{6}$/.test(candidate) || verifyingRef.current) return");
    expect(source).toContain("value.replace(/\\D/g, '').slice(0, 6)");
    expect(source).toContain('if (next.length === 6)');
    expect(source).toContain('await verify(candidate)');
  });

  it('prevents duplicate verification and resets the input after failure', () => {
    expect(source).toContain('verifyingRef.current = true');
    expect(source).toContain('verifyingRef.current = false');
    expect(source).toContain("setCode('')");
    expect(source).toContain("Alert.alert('Code not verified'");
    expect(source).toContain('inputRef.current?.focus()');
  });

  it('routes verified applicants to the correct application workflow', () => {
    expect(source).toContain("applicationType === 'RIDER' ? 'RiderApplication' : 'StoreApplication'");
    expect(source).toContain('navigation.replace(');
  });

  it('enforces resend cooldown and reloads delivery evidence', () => {
    expect(source).toContain('if (countdown > 0) return');
    expect(source).toContain('await requestVerification(deliveryChannel)');
    expect(source).toContain('await loadEvents()');
    expect(source).toContain('setCountdown(30)');
    expect(source).toContain('Resend code in 00:');
  });

  it('checks Firebase PNV capability before offering secure phone verification', () => {
    expect(source).toContain("apiClient.get('/partner-onboarding/verification-capabilities')");
    expect(source).toContain('FirebasePnv.isPnvSupported()');
    expect(source).toContain('capabilities.data?.phone?.pnvConfigured');
    expect(source).toContain('nativeSupport.supported');
  });

  it('uses authenticated PNV challenge and verification endpoints', () => {
    expect(source).toContain('`/partner-onboarding/applications/${applicationId}/phone-pnv/challenge`');
    expect(source).toContain('FirebasePnv.startPnvVerification(challenge.data.nonce)');
    expect(source).toContain('`/partner-onboarding/applications/${applicationId}/phone-pnv/verify`');
    expect(source).toContain('{ token: nativeResult.token }');
    expect(source).toContain('{ headers: applicationHeaders(accessToken) }');
  });

  it('provides an explicit SMS fallback when PNV is unavailable', () => {
    expect(source).toContain('setShowSmsFallback(true)');
    expect(source).toContain("{ channel: 'PHONE', fallbackFrom: 'FIREBASE_PNV' }");
    expect(source).toContain("label=\"Use SMS code\"");
    expect(source).toContain('Use the six-digit SMS option instead.');
  });
});
