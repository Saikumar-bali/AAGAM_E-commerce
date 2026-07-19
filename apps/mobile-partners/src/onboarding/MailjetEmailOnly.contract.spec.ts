import fs from 'node:fs';
import path from 'node:path';

const screen = fs.readFileSync(
  path.resolve(__dirname, '../screens/PartnerApplicationStartScreen.tsx'),
  'utf8',
);

describe('Mailjet email-only onboarding contracts', () => {
  it('loads backend verification capabilities before offering phone verification', () => {
    expect(screen).toMatch(
      /apiClient\s*\.get\('\/partner-onboarding\/verification-capabilities'\)/,
    );
    expect(screen).toContain("data?.mode !== 'EMAIL_ONLY'");
    expect(screen).toContain("data?.phone?.available !== false");
  });

  it('fails closed to email when capabilities cannot be loaded', () => {
    expect(screen).toContain('useState<boolean | null>(null)');
    expect(screen).toContain('setPhoneAvailable(false)');
    expect(screen).toContain("verificationChannel: phoneAvailable === false ? 'EMAIL' : 'PHONE'");
  });

  it('does not render or require the phone field when phone verification is disabled', () => {
    expect(screen).toContain('{phoneAvailable !== false ? (');
    expect(screen).toContain('Phone verification is unavailable on this deployment. Email verification will be used.');
    expect(screen).toContain("if (phoneAvailable === false && !email.trim())");
  });

  it('requires a valid phone before creating a phone-primary application', () => {
    expect(screen).toContain('if (phoneAvailable !== false && !/^\\+[1-9]\\d{7,14}$/.test(normalizedPhone))');
    expect(screen).toContain('phoneE164: phoneAvailable === false ? undefined : normalizedPhone');
    expect(screen).toContain("verificationChannel: phoneAvailable === false ? 'EMAIL' : 'PHONE'");
  });
});