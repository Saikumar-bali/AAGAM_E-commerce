import { ConflictException } from '@nestjs/common';
import {
  assertRiderEligibleForOperations,
  evaluateRiderEligibility,
} from './rider-operations-eligibility';

const approvedDocuments = [
  'DRIVING_LICENSE',
  'IDENTITY',
  'VEHICLE_REGISTRATION',
  'VEHICLE_INSURANCE',
].map((type, index) => ({
  id: `document-${index}`,
  type,
  status: 'APPROVED',
  expiresAt: new Date('2030-01-01T00:00:00.000Z'),
  createdAt: new Date(`2026-01-0${index + 1}T00:00:00.000Z`),
}));

describe('Rider operational eligibility', () => {
  it('allows an active approved Rider with current required documents', () => {
    expect(evaluateRiderEligibility({
      user: { isActive: true },
      approvalStatus: 'APPROVED',
      documents: approvedDocuments,
    }, new Date('2026-08-05T00:00:00.000Z')).eligible).toBe(true);
  });

  it.each([
    ['restricted account', { user: { isActive: false }, approvalStatus: 'APPROVED', documents: approvedDocuments }],
    ['pending approval', { user: { isActive: true }, approvalStatus: 'PENDING', documents: approvedDocuments }],
    ['missing document', { user: { isActive: true }, approvalStatus: 'APPROVED', documents: approvedDocuments.slice(0, 3) }],
    ['expired document', {
      user: { isActive: true },
      approvalStatus: 'APPROVED',
      documents: approvedDocuments.map((document, index) => index === 0
        ? { ...document, expiresAt: new Date('2026-01-01T00:00:00.000Z') }
        : document),
    }],
  ])('rejects %s', async (_label, rider) => {
    const db = { riderProfile: { findUnique: jest.fn().mockResolvedValue(rider) } };
    await expect(assertRiderEligibleForOperations(
      db,
      'rider-1',
      new Date('2026-08-05T00:00:00.000Z'),
    )).rejects.toBeInstanceOf(ConflictException);
  });
});
