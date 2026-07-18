import fs from 'node:fs';
import path from 'node:path';

const screen = fs.readFileSync(
  path.resolve(__dirname, '../screens/PartnerApplicationStartScreen.tsx'),
  'utf8',
);

describe('Mailjet email-only onboarding contracts', () => {
  it('loads backend verification capabilities before offering phone verification', () => {
    expect(screen).toContain("apiClient.get('/partner-onboarding/verification-capabilities')");
    expect(screen).toContain("data?.mode !== 'EMAIL_ONLY'");
    expect(screen).toContain('setPhoneAvailable(enabled)');
  });

  it('defaults to email and fails closed when capabilities cannot be loaded', () => {
    expect(screen).toContain("useState<'EMAIL' | 'PHONE'>('EMAIL')");
    expect(screen).toContain('setPhoneAvailable(false)');
    expect(screen).toContain("setChannel('EMAIL')");
  });

  it('does not render the phone field or phone choice when phone verification is disabled', () => {
    expect(screen).toContain('{phoneAvailable ? (');
    expect(screen).toContain('Phone verification is temporarily unavailable. Use email verification.');
  });

  it('refuses a stale phone selection before creating the application', () => {
    expect(screen).toContain("channel === 'PHONE' && (!phoneAvailable || !phone.trim())");
    expect(screen).toContain("verificationChannel: channel");
  });
});
