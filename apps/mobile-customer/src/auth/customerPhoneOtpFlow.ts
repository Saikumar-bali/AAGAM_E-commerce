export type CustomerPhoneOtpPurpose = 'LOGIN' | 'SIGNUP';

export type CustomerPhoneOtpChallenge = {
  channel: 'PHONE';
  maskedDestination: string;
  expiresAt: string;
  correlationId?: string;
  code?: string;
};

export type CustomerPhoneOtpResolution = {
  challenge: CustomerPhoneOtpChallenge;
  purpose: CustomerPhoneOtpPurpose;
  isNewCustomer: boolean;
};

export type RequestCustomerPhoneOtp = (
  phoneE164: string,
  purpose: CustomerPhoneOtpPurpose,
) => Promise<CustomerPhoneOtpChallenge>;

export type AsyncRequestLock = {
  run<T>(task: () => Promise<T>): Promise<T | undefined>;
  reset(): void;
  isLocked(): boolean;
};

export const getHttpStatus = (error: unknown): number | undefined => {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as {
    status?: unknown;
    response?: { status?: unknown };
  };
  const status = candidate.status ?? candidate.response?.status;
  return typeof status === 'number' && Number.isFinite(status) ? status : undefined;
};

export const createAsyncRequestLock = (): AsyncRequestLock => {
  let locked = false;

  return {
    async run<T>(task: () => Promise<T>) {
      if (locked) return undefined;
      locked = true;
      try {
        return await task();
      } finally {
        locked = false;
      }
    },
    reset() {
      locked = false;
    },
    isLocked() {
      return locked;
    },
  };
};

/**
 * Customer mobile intentionally starts with SIGNUP.
 *
 * This mirrors the working web registration flow and means a first-time phone
 * receives an OTP without depending on how a LOGIN "not found" response is
 * represented by a deployed API, reverse proxy, or Axios adapter. An existing
 * phone returns the stable SIGNUP conflict contract (409), after which LOGIN is
 * requested exactly once. No message text is inspected and no loop is possible.
 */
export const discoverCustomerPhoneOtp = async (
  requestOtp: RequestCustomerPhoneOtp,
  phoneE164: string,
): Promise<CustomerPhoneOtpResolution> => {
  try {
    const challenge = await requestOtp(phoneE164, 'SIGNUP');
    return { challenge, purpose: 'SIGNUP', isNewCustomer: true };
  } catch (signupError) {
    if (getHttpStatus(signupError) !== 409) throw signupError;

    const challenge = await requestOtp(phoneE164, 'LOGIN');
    return { challenge, purpose: 'LOGIN', isNewCustomer: false };
  }
};

export const resendCustomerPhoneOtp = async (
  requestOtp: RequestCustomerPhoneOtp,
  phoneE164: string,
  purpose: CustomerPhoneOtpPurpose,
): Promise<CustomerPhoneOtpChallenge> => requestOtp(phoneE164, purpose);
