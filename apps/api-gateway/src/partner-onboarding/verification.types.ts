export enum VerificationMethod {
  EMAIL_CODE = 'EMAIL_CODE',
  EMAIL_LINK = 'EMAIL_LINK',
  FIREBASE_PNV = 'FIREBASE_PNV',
  SMS_OTP = 'SMS_OTP',
}

export enum VerificationProvider {
  QA = 'QA',
  RESEND = 'RESEND',
  TWILIO = 'TWILIO',
  FIREBASE_PNV = 'FIREBASE_PNV',
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
