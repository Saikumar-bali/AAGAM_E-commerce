import {
  PartnerApplicationResponse,
  PartnerApplicationType,
} from '../onboarding/types';

export type ApplicantRouteName =
  | 'PartnerWelcome'
  | 'VerifyApplication'
  | 'RiderApplication'
  | 'StoreApplication'
  | 'ApplicationStatus';

export function resolveApplicantInitialRoute(
  applicationId: string | null,
  response: PartnerApplicationResponse | null,
  fallbackType: PartnerApplicationType | null,
): ApplicantRouteName {
  if (!applicationId) return 'PartnerWelcome';

  const application = response?.application;
  if (!application) return 'ApplicationStatus';

  const contactVerified = Boolean(
    application.emailVerifiedAt || application.phoneVerifiedAt,
  );
  if (!contactVerified) return 'VerifyApplication';

  if (application.status === 'DRAFT' || application.status === 'ACTION_REQUIRED') {
    const applicationType = application.type || fallbackType;
    return applicationType === 'RIDER' ? 'RiderApplication' : 'StoreApplication';
  }

  return 'ApplicationStatus';
}
