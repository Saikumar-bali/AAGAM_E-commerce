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
  it('creates the protected session, requests a real provider OTP and opens entry', async () => {
    const start = jest.fn().mockResolvedValue(undefined);
    const requestVerification = jest.fn().mockResolvedValue(undefined);
    const session = { applicationId: 'application-1', accessToken: 'access-token-1' };
    const navigator = navigation();

    await expect(
      startProtectedApplicationAndContinue({
        start,
        requestVerification,
        application,
        navigation: navigator,
        getSession: () => session,
      }),
    ).resolves.toEqual({ recoveredAfterProviderOrRefreshFailure: false });

    expect(start).toHaveBeenCalledWith(application);
    expect(requestVerification).toHaveBeenCalledWith('EMAIL');
    expect(navigator.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'VerifyApplication' }],
    });
  });

  it('opens OTP recovery when the provider rejects after the protected session was created', async () => {
    let session = { applicationId: null as string | null, accessToken: null as string | null };
    const start = jest.fn().mockImplementation(async () => {
      session = { applicationId: 'application-2', accessToken: 'access-token-2' };
    });
    const requestVerification = jest.fn().mockRejectedValue(new Error('Provider delivery failed'));
    const navigator = navigation();

    await expect(
      startProtectedApplicationAndContinue({
        start,
        requestVerification,
        application,
        navigation: navigator,
        getSession: () => session,
      }),
    ).resolves.toEqual({ recoveredAfterProviderOrRefreshFailure: true });

    expect(navigator.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'VerifyApplication' }],
    });
  });

  it('opens OTP recovery when the session refresh fails after creation', async () => {
    let session = { applicationId: null as string | null, accessToken: null as string | null };
    const start = jest.fn().mockImplementation(async () => {
      session = { applicationId: 'application-3', accessToken: 'access-token-3' };
      throw new Error('Application refresh failed');
    });
    const requestVerification = jest.fn();
    const navigator = navigation();

    await expect(
      startProtectedApplicationAndContinue({
        start,
        requestVerification,
        application,
        navigation: navigator,
        getSession: () => session,
      }),
    ).resolves.toEqual({ recoveredAfterProviderOrRefreshFailure: true });

    expect(requestVerification).not.toHaveBeenCalled();
    expect(navigator.reset).toHaveBeenCalled();
  });

  it('does not hide a real application creation failure', async () => {
    const failure = new Error('Duplicate application');
    const start = jest.fn().mockRejectedValue(failure);
    const requestVerification = jest.fn();
    const navigator = navigation();
    const session = { applicationId: null, accessToken: null };

    await expect(
      startProtectedApplicationAndContinue({
        start,
        requestVerification,
        application,
        navigation: navigator,
        getSession: () => session,
      }),
    ).rejects.toBe(failure);

    expect(requestVerification).not.toHaveBeenCalled();
    expect(navigator.reset).not.toHaveBeenCalled();
  });

  it('does not mistake an unchanged stale session for a newly created application', async () => {
    const failure = new Error('Duplicate application');
    const start = jest.fn().mockRejectedValue(failure);
    const requestVerification = jest.fn();
    const navigator = navigation();
    const session = { applicationId: 'old-application', accessToken: 'old-token' };

    await expect(
      startProtectedApplicationAndContinue({
        start,
        requestVerification,
        application,
        navigation: navigator,
        getSession: () => session,
      }),
    ).rejects.toBe(failure);

    expect(navigator.reset).not.toHaveBeenCalled();
  });
});
