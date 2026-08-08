export enum VerificationMethod {
  EMAIL_CODE = 'EMAIL_CODE',
  EMAIL_LINK = 'EMAIL_LINK',
  FIREBASE_PNV = 'FIREBASE_PNV',
  SMS_OTP = 'SMS_OTP',
}

export enum VerificationProvider {
  QA = 'QA',
  RESEND = 'RESEND',
  MAILJET = 'MAILJET',
  TWILIO = 'TWILIO',
  WHATSAPP = 'WHATSAPP',
  FIREBASE_PNV = 'FIREBASE_PNV',
}

export type EmailVerificationProvider =
  | VerificationProvider.RESEND
  | VerificationProvider.MAILJET;

export function selectedEmailVerificationProvider(): EmailVerificationProvider {
  const configured = process.env.PARTNER_EMAIL_PROVIDER?.trim().toUpperCase();
  if (configured === VerificationProvider.MAILJET) return VerificationProvider.MAILJET;
  if (configured === VerificationProvider.RESEND) return VerificationProvider.RESEND;

  // Preserve existing deployments while allowing a Mailjet-only environment to self-select
  // outside production validation (for example, local development).
  if (process.env.MAILJET_API_KEY?.trim() && process.env.MAILJET_SECRET_KEY?.trim()) {
    return VerificationProvider.MAILJET;
  }
  return VerificationProvider.RESEND;
}

export enum VerificationChallengeStatus {
  CREATED = 'CREATED',
  DISPATCHING = 'DISPATCHING',
  SENT = 'SENT',
  VERIFIED = 'VERIFIED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
  SUPERSEDED = 'SUPERSEDED',
}

export type VerificationChallengeRow = {
  id: string;
  applicationId: string;
  method: VerificationMethod;
  provider: VerificationProvider;
  destinationHash: string;
  nonceHash: string | null;
  tokenJti: string | null;
  providerDeliveryId: string | null;
  status: VerificationChallengeStatus;
  attemptCount: number;
  expiresAt: Date;
  verifiedAt: Date | null;
  failureCode: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function isVerificationQaMode(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.NODE_ENV === 'test' || process.env.PLAYWRIGHT_QA === 'true';
}
