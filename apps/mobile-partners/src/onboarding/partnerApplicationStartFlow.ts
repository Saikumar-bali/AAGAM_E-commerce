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
  requestVerification: (channel: 'EMAIL' | 'PHONE') => Promise<void>;
  application: PartnerApplicationStartInput;
  getSession: () => ProtectedApplicationSession;
  navigation: VerificationNavigation;
}): Promise<{ recoveredAfterProviderOrRefreshFailure: boolean }> {
  const sessionBeforeStart = input.getSession();

  try {
    await input.start(input.application);
    // The create endpoint protects and persists the draft. Delivery is always
    // performed by the provider-backed verification endpoint so Resend/Mailjet
    // or the configured phone provider is the only source of a usable OTP.
    await input.requestVerification(input.application.verificationChannel);
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

    // The protected draft exists even if provider delivery or the follow-up
    // refresh failed. Keep it and open verification so the applicant can see
    // the safe delivery state, retry, go back, or resume later.
    resetToPartnerVerification(input.navigation);
    return { recoveredAfterProviderOrRefreshFailure: true };
  }
}
