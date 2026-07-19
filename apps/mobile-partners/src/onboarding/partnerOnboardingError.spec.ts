import { toPartnerOnboardingError } from './partnerOnboardingError';
import { verificationRequestErrorMessage } from './partnerVerificationPresentation';

describe('partner onboarding error normalization', () => {
  it('preserves the safe provider code and correlation reference', () => {
    const normalized = toPartnerOnboardingError(
      {
        response: {
          data: {
            message: 'Partner email verification could not be delivered',
            code: 'MAILJET_AUTH_REJECTED',
            correlationId: 'mailjet-reference-1',
          },
        },
      },
      'Could not send verification code',
    );

    expect(normalized.message).toBe('Partner email verification could not be delivered');
    expect(normalized.safeCode).toBe('MAILJET_AUTH_REJECTED');
    expect(normalized.correlationId).toBe('mailjet-reference-1');
  });

  it('renders the preserved diagnostics in the resend popup message', () => {
    const normalized = toPartnerOnboardingError(
      {
        response: {
          data: {
            message: 'Partner email verification could not be delivered',
            code: 'MAILJET_AUTH_REJECTED',
            correlationId: 'mailjet-reference-2',
          },
        },
      },
      'Could not send verification code',
    );

    const presentation = verificationRequestErrorMessage(normalized);
    expect(presentation).toContain('Code: MAILJET_AUTH_REJECTED');
    expect(presentation).toContain('Reference: mailjet-reference-2');
  });

  it('keeps array validation messages readable', () => {
    const normalized = toPartnerOnboardingError(
      { response: { data: { message: ['Email is invalid', 'Try again'] } } },
      'Fallback',
    );
    expect(normalized.message).toBe('Email is invalid, Try again');
  });

  it('does not copy credentials or unrelated response fields', () => {
    const normalized = toPartnerOnboardingError(
      {
        response: {
          data: {
            message: 'Delivery failed',
            code: 'MAILJET_REJECTED',
            apiSecret: 'must-not-be-copied',
          },
        },
      },
      'Fallback',
    ) as any;

    expect(normalized.safeCode).toBe('MAILJET_REJECTED');
    expect(normalized.apiSecret).toBeUndefined();
    expect(normalized.response).toBeUndefined();
  });

  it('uses the fallback for an unknown failure', () => {
    expect(toPartnerOnboardingError(null, 'Could not send verification code').message).toBe(
      'Could not send verification code',
    );
  });
});
