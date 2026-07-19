import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('partner onboarding review contracts', () => {
  it('keeps public web signup customer-only with phone OTP and no bearer-token storage', () => {
    const source = readFileSync(
      path.resolve(
        __dirname,
        '../../admin-dashboard/src/app/(auth)/signup/page.tsx',
      ),
      'utf8',
    );

    expect(source).toContain("apiClient.post('/auth/phone/request'");
    expect(source).toContain("apiClient.post('/auth/phone/verify'");
    expect(source).toContain("purpose: 'SIGNUP'");
    expect(source).not.toContain("role: 'CUSTOMER'");
    expect(source).not.toContain("localStorage.setItem('access_token'");
    expect(source).not.toContain("apiClient.post('/auth/signup'");
  });

  it('routes Partner onboarding through delivery, editable-resume and phone verification services', () => {
    const source = readFileSync(
      path.resolve(__dirname, 'partner-onboarding/partner-onboarding.module.ts'),
      'utf8',
    );

    expect(source).toContain('PartnerVerificationDeliveryService');
    expect(source).toContain(
      'useClass: EditableDeliveringPartnerOnboardingService',
    );
    expect(source).toContain(
      'useClass: PhonePrimaryPartnerVerificationService',
    );
    expect(source).toContain('PartnerApplicationRecoveryService');
  });
});
