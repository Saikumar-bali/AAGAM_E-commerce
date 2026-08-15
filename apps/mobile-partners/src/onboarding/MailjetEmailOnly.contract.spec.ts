import fs from 'node:fs';
import path from 'node:path';

const screen = fs.readFileSync(
  path.resolve(__dirname, '../screens/PartnerApplicationStartScreen.tsx'),
  'utf8',
);

describe('mandatory partner email verification contracts', () => {
  it('does not branch new applications back to phone verification capabilities', () => {
    expect(screen).not.toContain("apiClient.get('/partner-onboarding/verification-capabilities')");
    expect(screen).not.toContain('phoneAvailable');
    expect(screen).not.toContain("verificationChannel: 'PHONE'");
  });

  it('requires a valid email and always creates new applications with email verification', () => {
    expect(screen).toContain('if (!EMAIL_PATTERN.test(normalizedEmail))');
    expect(screen).toContain('Valid email required');
    expect(screen).toContain("verificationChannel: 'EMAIL'");
    expect(screen).toContain('Send email verification code');
  });

  it('keeps a valid mobile number required only as the operational contact', () => {
    expect(screen).toContain("if (!/^\\+[1-9]\\d{7,14}$/.test(normalizedPhone))");
    expect(screen).toContain('Mobile number required');
    expect(screen).toContain('phoneE164: normalizedPhone');
    expect(screen).toContain('This number is not the verification channel for a new application.');
  });

  it('communicates that phone OTP is not part of new partner application verification', () => {
    expect(screen).toContain('Mandatory email verification');
    expect(screen).toContain('no phone OTP is required for this application step');
  });
});
