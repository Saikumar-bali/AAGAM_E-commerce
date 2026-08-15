import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Customer mobile verified email signup contract', () => {
  const screen = readFileSync(__dirname + '/SignUpScreen.tsx', 'utf8');
  const authStore = readFileSync(resolve(__dirname, '../../../../packages/mobile-shared/src/store/authStore.ts'), 'utf8');
  const authController = readFileSync(resolve(__dirname, '../../../api-gateway/src/auth/auth.controller.ts'), 'utf8');

  test('create-account screen uses email verification instead of phone OTP', () => {
    expect(screen).toContain('requestEmailSignup');
    expect(screen).toContain('verifyEmailSignup');
    expect(screen).toContain('Password (at least 8 characters)');
    expect(screen).toContain('Confirm password');
    expect(screen).toContain('Email verification code');
    expect(screen).not.toContain("requestPhoneOtp(phone");
    expect(screen).not.toContain("purpose: 'SIGNUP'");
  });

  test('mobile verification returns and persists the session from the same email signup service as web', () => {
    expect(authStore).toContain("apiClient.post('/auth/email/signup/request'");
    expect(authStore).toContain("apiClient.post('/auth/mobile/email/signup/verify'");
    expect(authStore).toContain('await persistAuth(user, access_token)');
    expect(authController).toContain("@Post('mobile/email/signup/verify')");
    expect(authController).toContain('this.authService.verifyEmailSignupOtp(dto)');
  });
});
