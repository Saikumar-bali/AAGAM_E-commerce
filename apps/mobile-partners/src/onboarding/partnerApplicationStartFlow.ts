export type PartnerApplicationStartInput = {
  type: 'RIDER' | 'STORE';
  applicantName: string;
  email?: string;
  phoneE164?: string;
  verificationChannel: 'EMAIL' | 'PHONE';
};

type ProtectedApplicationSession = {
  applicationId: string | null;
  accessToken: string | null;
};

type VerificationNavigation = {
  reset(state: { index: number; routes: Array<{ name: 'VerifyApplication' }> }): void;
};

export function resetToPartnerVerification(navigation: VerificationNavigation) {
  navigation.reset({
    index: 0,
    routes: [{ name: 'VerifyApplication' }],
  });
}

export async function startProtectedApplicationAndContinue(input: {
  start: (application: PartnerApplicationStartInput) => Promise<void>;
  application: PartnerApplicationStartInput;
  getSession: () => ProtectedApplicationSession;
  navigation: VerificationNavigation;
}): Promise<{ recoveredAfterProviderOrRefreshFailure: boolean }> {
  const sessionBeforeStart = input.getSession();

  try {
    // The runtime DeliveringPartnerOnboardingService creates the protected
    // draft and performs exactly one provider-backed OTP request atomically
    // from the mobile caller's perspective.
    await input.start(input.application);
    resetToPartnerVerification(input.navigation);
    return { recoveredAfterProviderOrRefreshFailure: false };
  } catch (error) {
    const sessionAfterFailure = input.getSession();
    const createdProtectedSession = Boolean(
      sessionAfterFailure.applicationId &&
        sessionAfterFailure.accessToken &&
        (sessionAfterFailure.applicationId !== sessionBeforeStart.applicationId ||
          sessionAfterFailure.accessToken !== sessionBeforeStart.accessToken),
    );

    if (!createdProtectedSession) throw error;

    // The protected draft and its provider delivery attempt exist even when a
    // follow-up application refresh fails. Keep the session and open the OTP
    // screen so delivery state, retry and safe back navigation remain available.
    resetToPartnerVerification(input.navigation);
    return { recoveredAfterProviderOrRefreshFailure: true };
  }
}
