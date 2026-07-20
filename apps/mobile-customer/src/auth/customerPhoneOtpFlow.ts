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

export const discoverCustomerPhoneOtp = async (
  requestOtp: RequestCustomerPhoneOtp,
  phoneE164: string,
): Promise<CustomerPhoneOtpResolution> => {
  try {
    const challenge = await requestOtp(phoneE164, 'LOGIN');
    return { challenge, purpose: 'LOGIN', isNewCustomer: false };
  } catch (loginError) {
    if (getHttpStatus(loginError) !== 404) throw loginError;

    try {
      const challenge = await requestOtp(phoneE164, 'SIGNUP');
      return { challenge, purpose: 'SIGNUP', isNewCustomer: true };
    } catch (signupError) {
      if (getHttpStatus(signupError) !== 409) throw signupError;

      // The account may have been created after the LOGIN lookup. Retry once only.
      const challenge = await requestOtp(phoneE164, 'LOGIN');
      return { challenge, purpose: 'LOGIN', isNewCustomer: false };
    }
  }
};

export const resendCustomerPhoneOtp = async (
  requestOtp: RequestCustomerPhoneOtp,
  phoneE164: string,
  purpose: CustomerPhoneOtpPurpose,
): Promise<CustomerPhoneOtpChallenge> => requestOtp(phoneE164, purpose);
