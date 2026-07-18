import {
  PartnerApplicationStartInput,
  startProtectedApplicationAndContinue,
} from '../onboarding/partnerApplicationStartFlow';

const application: PartnerApplicationStartInput = {
  type: 'RIDER',
  applicantName: 'Test Rider',
  email: 'rider@example.com',
  phoneE164: undefined,
  verificationChannel: 'EMAIL',
};

function navigation() {
  return { reset: jest.fn() };
}

describe('protected application OTP transition', () => {
  it('opens OTP entry after protected application creation succeeds', async () => {
    const start = jest.fn().mockResolvedValue(undefined);
    const session = { applicationId: 'application-1', accessToken: 'access-token-1' };
    const navigator = navigation();

    await expect(
      startProtectedApplicationAndContinue({
        start,
        application,
        navigation: navigator,
        getSession: () => session,
      }),
    ).resolves.toEqual({ recoveredAfterRefreshFailure: false });

    expect(start).toHaveBeenCalledWith(application);
    expect(navigator.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'VerifyApplication' }],
    });
  });

  it('opens OTP entry when creation and delivery succeeded but the immediate refresh failed', async () => {
    let session = { applicationId: null as string | null, accessToken: null as string | null };
    const start = jest.fn().mockImplementation(async () => {
      session = { applicationId: 'application-2', accessToken: 'access-token-2' };
      throw new Error('Application refresh failed after OTP delivery');
    });
    const navigator = navigation();

    await expect(
      startProtectedApplicationAndContinue({
        start,
        application,
        navigation: navigator,
        getSession: () => session,
      }),
    ).resolves.toEqual({ recoveredAfterRefreshFailure: true });

    expect(navigator.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'VerifyApplication' }],
    });
  });

  it('does not hide a real application creation failure', async () => {
    const failure = new Error('Mailjet request was not accepted');
    const start = jest.fn().mockRejectedValue(failure);
    const navigator = navigation();
    const session = { applicationId: null, accessToken: null };

    await expect(
      startProtectedApplicationAndContinue({
        start,
        application,
        navigation: navigator,
        getSession: () => session,
      }),
    ).rejects.toBe(failure);

    expect(navigator.reset).not.toHaveBeenCalled();
  });

  it('does not mistake an unchanged stale session for a newly created application', async () => {
    const failure = new Error('Duplicate application');
    const start = jest.fn().mockRejectedValue(failure);
    const navigator = navigation();
    const session = { applicationId: 'old-application', accessToken: 'old-token' };

    await expect(
      startProtectedApplicationAndContinue({
        start,
        application,
        navigation: navigator,
        getSession: () => session,
      }),
    ).rejects.toBe(failure);

    expect(navigator.reset).not.toHaveBeenCalled();
  });
});
