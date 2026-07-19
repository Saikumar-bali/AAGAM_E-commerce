import { resolveApplicantInitialRoute } from './applicantRoute';
import { PartnerApplicationResponse } from '../onboarding/types';

function response(overrides: Record<string, unknown> = {}): PartnerApplicationResponse {
  return {
    application: {
      id: 'application-1',
      applicationNumber: 'AAG-RID-2026-TEST',
      type: 'RIDER',
      status: 'DRAFT',
      submissionVersion: 0,
      applicantName: 'Test Rider',
      email: 'rider@example.com',
      phoneE164: null,
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
      verificationChannel: 'EMAIL',
      applicantPayload: {},
      actionRequests: null,
      provisionedUserId: null,
      provisionedStoreId: null,
      createdAt: '2026-07-18T00:00:00.000Z',
      updatedAt: '2026-07-18T00:00:00.000Z',
      ...overrides,
    },
    documents: [],
    requirements: {
      requiredDocuments: [],
      allowedDocuments: [],
      completedRequired: [],
      completionPercent: 0,
    },
  };
}

describe('resolveApplicantInitialRoute', () => {
  it('starts a new applicant at the welcome screen', () => {
    expect(resolveApplicantInitialRoute(null)).toBe('PartnerWelcome');
  });

  it('returns an unverified restored application to OTP entry', () => {
    expect(resolveApplicantInitialRoute(response())).toBe('VerifyApplication');
  });

  it('returns a verified Rider draft to the first incomplete Rider step', () => {
    expect(
      resolveApplicantInitialRoute(
        response({ emailVerifiedAt: '2026-07-18T01:00:00.000Z' }),
      ),
    ).toBe('RiderApplication');
  });

  it('returns a verified Store correction draft to the first incomplete Store step', () => {
    expect(
      resolveApplicantInitialRoute(
        response({
          type: 'STORE',
          status: 'ACTION_REQUIRED',
          emailVerifiedAt: '2026-07-18T01:00:00.000Z',
        }),
      ),
    ).toBe('StoreApplication');
  });

  it('keeps submitted applications on status tracking', () => {
    expect(
      resolveApplicantInitialRoute(
        response({
          status: 'SUBMITTED',
          emailVerifiedAt: '2026-07-18T01:00:00.000Z',
        }),
      ),
    ).toBe('ApplicationStatus');
  });
});