import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Partner application verification contract', () => {
  const screen = readFileSync(__dirname + '/PartnerApplicationStartScreen.tsx', 'utf8');
  const controller = readFileSync(resolve(__dirname, '../../../api-gateway/src/partner-onboarding/partner-onboarding.controller.ts'), 'utf8');

  test('new Rider and Store applications always choose email verification in the app', () => {
    expect(screen).toContain("verificationChannel: 'EMAIL'");
    expect(screen).toContain('Valid email required');
    expect(screen).toContain('Send email verification code');
    expect(screen).toContain('no phone OTP is required');
  });

  test('API forces email for new applications and prevents switching them to phone verification', () => {
    expect(controller).toContain('verificationChannel: PartnerContactChannel.EMAIL');
    expect(controller).toContain('Email is required for Partner onboarding verification');
    expect(controller).toContain("application?.verificationChannel !== PartnerContactChannel.PHONE");
    expect(controller).toContain('Email verification is mandatory for new Partner applications');
    expect(controller).toContain('Verify your email before submitting the Partner application');
  });

  test('legacy phone-started applications remain distinguishable for backward-compatible phone verification', () => {
    expect(controller).toContain('application?.verificationChannel !== PartnerContactChannel.PHONE');
    expect(controller).toContain('this.verification.createPnvChallenge(id, token)');
    expect(controller).toContain('this.verification.verifyPnv(id, token, dto.token)');
  });
});
