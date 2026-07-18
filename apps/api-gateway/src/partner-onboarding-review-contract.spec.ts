import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('partner onboarding review contracts', () => {
  it('keeps public web signup customer-only without posting a role or storing bearer tokens', () => {
    const source = readFileSync(
      path.resolve(
        __dirname,
        '../../admin-dashboard/src/app/(auth)/signup/page.tsx',
      ),
      'utf8',
    );

    expect(source).toContain("apiClient.post('/auth/signup', { name, email, password })");
    expect(source).not.toContain("role: 'CUSTOMER'");
    expect(source).not.toContain("localStorage.setItem('access_token'");
  });

  it('routes partner onboarding through the delivery-enforcing service', () => {
    const source = readFileSync(
      path.resolve(__dirname, 'partner-onboarding/partner-onboarding.module.ts'),
      'utf8',
    );

    expect(source).toContain('PartnerVerificationDeliveryService');
    expect(source).toContain('useClass: DeliveringPartnerOnboardingService');
  });
});
