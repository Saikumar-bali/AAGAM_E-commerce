export type PartnerApplicationType = 'RIDER' | 'STORE';

export type PartnerApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'ACTION_REQUIRED'
  | 'APPROVED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'EXPIRED';

export type PartnerDocument = {
  id: string;
  type: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  documentNumberLast4?: string | null;
  expiresAt?: string | null;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED' | 'REPLACEMENT_REQUIRED';
  reviewNote?: string | null;
  reviewedByUserId?: string | null;
  reviewedAt?: string | null;
  uploadedAt?: string | null;
  version?: number;
};

export type PartnerApplication = {
  id: string;
  applicationNumber: string;
  type: PartnerApplicationType;
  status: PartnerApplicationStatus;
  submissionVersion: number;
  applicantName: string;
  email?: string | null;
  phoneE164?: string | null;
  emailVerifiedAt?: string | null;
  phoneVerifiedAt?: string | null;
  verificationChannel?: 'EMAIL' | 'PHONE' | null;
  applicantPayload: Record<string, any>;
  actionRequests?: Record<string, any> | null;
  provisionedUserId?: string | null;
  provisionedStoreId?: string | null;
  linkedExistingUser?: boolean;
  contactVerificationMethod?: string | null;
  contactVerificationReason?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PartnerApplicationResponse = {
  application: PartnerApplication;
  documents: PartnerDocument[];
  requirements: {
    requiredDocuments: string[];
    allowedDocuments: string[];
    completedRequired: string[];
    completionPercent: number;
  };
};

export type PartnerApplicationEvent = {
  id: string;
  eventType: string;
  actorKind: string;
  fromStatus?: PartnerApplicationStatus | null;
  toStatus?: PartnerApplicationStatus | null;
  message?: string | null;
  metadata?: Record<string, any> | null;
  createdAt: string;
};

export const statusLabel = (status?: PartnerApplicationStatus) =>
  (status || 'DRAFT')
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export const editableApplication = (status?: PartnerApplicationStatus) =>
  status === 'DRAFT' || status === 'ACTION_REQUIRED';
