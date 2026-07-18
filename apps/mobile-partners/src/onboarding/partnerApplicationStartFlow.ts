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
}): Promise<{ recoveredAfterRefreshFailure: boolean }> {
  const sessionBeforeStart = input.getSession();

  try {
    await input.start(input.application);
    resetToPartnerVerification(input.navigation);
    return { recoveredAfterRefreshFailure: false };
  } catch (error) {
    const sessionAfterFailure = input.getSession();
    const createdProtectedSession = Boolean(
      sessionAfterFailure.applicationId &&
        sessionAfterFailure.accessToken &&
        (sessionAfterFailure.applicationId !== sessionBeforeStart.applicationId ||
          sessionAfterFailure.accessToken !== sessionBeforeStart.accessToken),
    );

    if (!createdProtectedSession) throw error;

    // Application creation and OTP delivery succeeded, but a follow-up refresh failed.
    // Keep the newly issued application session and let the applicant enter the OTP.
    resetToPartnerVerification(input.navigation);
    return { recoveredAfterRefreshFailure: true };
  }
}
