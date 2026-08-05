import { ConflictException, NotFoundException } from '@nestjs/common';

export const REQUIRED_RIDER_DOCUMENT_TYPES = [
  'DRIVING_LICENSE',
  'IDENTITY',
  'VEHICLE_REGISTRATION',
  'VEHICLE_INSURANCE',
] as const;

export type RiderEligibilityResult = {
  eligible: boolean;
  reasons: string[];
  documentEligibility: Array<{
    type: string;
    eligible: boolean;
    status: string;
    expiresAt: Date | null;
  }>;
};

export function evaluateRiderEligibility(
  rider: any,
  now = new Date(),
): RiderEligibilityResult {
  const documents = Array.isArray(rider?.documents) ? rider.documents : [];
  const latestByType = new Map<string, any>();
  for (const document of documents) {
    if (!latestByType.has(String(document.type))) {
      latestByType.set(String(document.type), document);
    }
  }

  const documentEligibility = REQUIRED_RIDER_DOCUMENT_TYPES.map((type) => {
    const document = latestByType.get(type);
    const expired = Boolean(
      document?.expiresAt && new Date(document.expiresAt).getTime() < now.getTime(),
    );
    return {
      type,
      eligible: Boolean(document && document.status === 'APPROVED' && !expired),
      status: document?.status || 'MISSING',
      expiresAt: document?.expiresAt || null,
    };
  });

  const reasons: string[] = [];
  if (!rider?.user?.isActive) reasons.push('RIDER_ACCOUNT_RESTRICTED');
  if (rider?.approvalStatus !== 'APPROVED') reasons.push('RIDER_APPROVAL_REQUIRED');
  for (const document of documentEligibility) {
    if (!document.eligible) reasons.push(`${document.type}_${document.status}`);
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    documentEligibility,
  };
}

export async function loadRiderEligibility(
  db: any,
  riderProfileId: string,
  now = new Date(),
) {
  const rider = await db.riderProfile.findUnique({
    where: { id: riderProfileId },
    include: {
      user: { select: { isActive: true } },
      documents: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!rider) throw new NotFoundException('Rider profile not found');
  return evaluateRiderEligibility(rider, now);
}

export async function assertRiderEligibleForOperations(
  db: any,
  riderProfileId: string,
  now = new Date(),
) {
  const eligibility = await loadRiderEligibility(db, riderProfileId, now);
  if (!eligibility.eligible) {
    throw new ConflictException({
      message: 'Rider is not eligible to go online or accept delivery work',
      reasons: eligibility.reasons,
    });
  }
  return eligibility;
}
