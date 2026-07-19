import { PartnerApplicationStatus } from './types';

export type ApplicationProgressStep = {
  key: 'CONTACT' | 'APPLICATION' | 'SUBMITTED' | 'REVIEW' | 'DECISION';
  label: string;
  state: 'COMPLETE' | 'CURRENT' | 'UPCOMING' | 'ATTENTION' | 'REJECTED';
};

export function buildApplicationProgress(
  status: PartnerApplicationStatus,
  contactVerified: boolean,
  completionPercent: number,
): ApplicationProgressStep[] {
  const steps: ApplicationProgressStep[] = [
    { key: 'CONTACT', label: 'Contact verified', state: contactVerified ? 'COMPLETE' : 'CURRENT' },
    { key: 'APPLICATION', label: 'Application and documents', state: 'UPCOMING' },
    { key: 'SUBMITTED', label: 'Submitted to AAGAM', state: 'UPCOMING' },
    { key: 'REVIEW', label: 'Admin review', state: 'UPCOMING' },
    { key: 'DECISION', label: 'Final decision', state: 'UPCOMING' },
  ];

  if (!contactVerified) return steps;

  if (status === 'DRAFT') {
    steps[1].state = 'CURRENT';
    steps[1].label =
      completionPercent >= 100 ? 'Ready to submit' : 'Complete application and documents';
    return steps;
  }

  steps[1].state = 'COMPLETE';
  steps[2].state = 'COMPLETE';

  if (status === 'SUBMITTED') {
    steps[2].state = 'CURRENT';
    return steps;
  }

  if (status === 'UNDER_REVIEW') {
    steps[3].state = 'CURRENT';
    return steps;
  }

  if (status === 'ACTION_REQUIRED') {
    steps[1].state = completionPercent >= 100 ? 'COMPLETE' : 'ATTENTION';
    steps[3] = { key: 'REVIEW', label: 'Applicant changes required', state: 'ATTENTION' };
    return steps;
  }

  steps[3].state = 'COMPLETE';
  if (status === 'APPROVED') {
    steps[4] = { key: 'DECISION', label: 'Approved — activate account', state: 'COMPLETE' };
  } else if (status === 'REJECTED') {
    steps[4] = { key: 'DECISION', label: 'Application not approved', state: 'REJECTED' };
  } else if (status === 'WITHDRAWN') {
    steps[4] = { key: 'DECISION', label: 'Application withdrawn', state: 'REJECTED' };
  } else if (status === 'EXPIRED') {
    steps[4] = { key: 'DECISION', label: 'Application expired', state: 'REJECTED' };
  }

  return steps;
}
