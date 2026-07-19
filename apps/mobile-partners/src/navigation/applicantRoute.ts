import { PartnerApplicationResponse } from '../onboarding/types';

export type ApplicantRouteName =
  | 'PartnerWelcome'
  | 'VerifyApplication'
  | 'RiderApplication'
  | 'StoreApplication'
  | 'ApplicationDocuments'
  | 'ApplicationStatus';

function present(value: unknown) {
  return value !== undefined && value !== null && value !== '';
}

export function riderResumeStep(payload: Record<string, any>): number | null {
  if (!['dateOfBirth', 'addressLine1', 'city', 'state', 'pincode'].every((key) => present(payload[key]))) return 0;
  if (!present(payload.vehicleType)) return 1;
  if (!['emergencyContactName', 'emergencyContactPhone'].every((key) => present(payload[key]))) return 2;
  if (!present(payload.bankAccountCiphertext) || !present(payload.bankIfscCiphertext)) return 3;
  return null;
}

export function storeResumeStep(payload: Record<string, any>): number | null {
  if (!['legalName', 'displayName', 'businessType'].every((key) => present(payload[key])) || !Array.isArray(payload.categories) || payload.categories.length === 0) return 0;
  if (!['storeAddress', 'city', 'state', 'pincode', 'latitude', 'longitude'].every((key) => present(payload[key]))) return 1;
  if (!['operatingHours', 'serviceRadiusKm', 'orderCapacity'].every((key) => present(payload[key]))) return 2;
  if (!present(payload.bankAccountCiphertext) || !present(payload.bankIfscCiphertext)) return 3;
  return null;
}

export function resolveApplicantInitialRoute(
  response: PartnerApplicationResponse | null | undefined,
): ApplicantRouteName {
  const application = response?.application;
  if (!application) return 'PartnerWelcome';
  if (!application.emailVerifiedAt && !application.phoneVerifiedAt) return 'VerifyApplication';

  if (['APPROVED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'].includes(application.status)) {
    return 'ApplicationStatus';
  }
  if (['SUBMITTED', 'UNDER_REVIEW'].includes(application.status)) {
    return 'ApplicationStatus';
  }

  const payload = application.applicantPayload || {};
  const profileStep = application.type === 'RIDER' ? riderResumeStep(payload) : storeResumeStep(payload);
  if (profileStep !== null) {
    return application.type === 'RIDER' ? 'RiderApplication' : 'StoreApplication';
  }

  const blockedDocument = response?.documents.some((document) =>
    ['REJECTED', 'EXPIRED', 'REPLACEMENT_REQUIRED'].includes(document.status),
  );
  if (response?.requirements.completionPercent !== 100 || blockedDocument) {
    return 'ApplicationDocuments';
  }
  return 'ApplicationStatus';
}
