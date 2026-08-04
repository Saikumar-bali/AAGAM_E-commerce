import { NotFoundException } from '@nestjs/common';
import { prisma } from '@aagam/database';
import { RiderPortalReadService } from './rider-portal-read.service';

jest.mock('@aagam/database', () => ({
  Prisma: { sql: jest.fn() },
  prisma: {
    riderProfile: { findUnique: jest.fn() },
    deliveryJob: { findFirst: jest.fn() },
    riderDocument: { findFirst: jest.fn(), findMany: jest.fn() },
    riderEarning: { findMany: jest.fn() },
    dispatchAssignment: { findFirst: jest.fn() },
    riderShift: { count: jest.fn(), findFirst: jest.fn() },
    riderSupportTicket: { create: jest.fn() },
    $queryRaw: jest.fn(),
  },
}));

describe('Rider Portal ownership isolation', () => {
  const upload = { signedEvidenceUrl: jest.fn() };
  const service = new RiderPortalReadService(upload as any);
  const riderFindUnique = prisma.riderProfile.findUnique as jest.Mock;
  const jobFindFirst = prisma.deliveryJob.findFirst as jest.Mock;
  const documentFindFirst = prisma.riderDocument.findFirst as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    riderFindUnique.mockResolvedValue({ id: 'rider-owned', userId: 'user-owned' });
  });

  it('does not return history detail for a job owned by another Rider', async () => {
    jobFindFirst.mockResolvedValue(null);

    await expect(
      service.historyDetail('user-owned', 'job-foreign'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(jobFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'job-foreign',
        currentRiderId: 'rider-owned',
      },
    }));
  });

  it('does not build a receipt for a job owned by another Rider', async () => {
    jobFindFirst.mockResolvedValue(null);

    await expect(
      service.receipt('user-owned', 'job-foreign'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(jobFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'job-foreign',
        currentRiderId: 'rider-owned',
      },
    }));
  });

  it('does not sign a document preview owned by another Rider', async () => {
    documentFindFirst.mockResolvedValue(null);

    await expect(
      service.documentPreview('user-owned', 'document-foreign'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(documentFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'document-foreign',
        riderProfileId: 'rider-owned',
      },
    });
    expect(upload.signedEvidenceUrl).not.toHaveBeenCalled();
  });
});
