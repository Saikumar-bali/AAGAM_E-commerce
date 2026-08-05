import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { prisma } from '@aagam/database';
import { RiderPortalSecureService } from './rider-portal-secure.service';

jest.mock('@aagam/database', () => ({
  Prisma: { sql: jest.fn() },
  prisma: {
    riderProfile: { findUnique: jest.fn() },
    deliveryJob: { findFirst: jest.fn(), findMany: jest.fn() },
    riderEarning: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
  },
}));

describe('RiderPortalSecureService', () => {
  const read = {
    historyDetail: jest.fn(),
    receipt: jest.fn(),
    offerDetail: jest.fn(),
    contact: jest.fn(),
  };
  const service = new RiderPortalSecureService(read as any);

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.riderProfile.findUnique as jest.Mock).mockResolvedValue({
      id: 'rider-owned',
    });
    (prisma.riderEarning.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
  });

  it('queries terminal history through durable ownership evidence', async () => {
    (prisma.deliveryJob.findMany as jest.Mock).mockResolvedValue([]);

    await service.history('user-owned', { status: 'ALL' } as any);

    expect(prisma.deliveryJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { deliveryProof: { is: { riderId: 'rider-owned' } } },
            expect.objectContaining({
              AND: expect.arrayContaining([
                { status: 'CANCELLED' },
                expect.objectContaining({ assignments: expect.any(Object) }),
              ]),
            }),
          ]),
        }),
      }),
    );
  });

  it('restores a cancelled accepted job after currentRiderId is cleared', async () => {
    (prisma.deliveryJob.findFirst as jest.Mock).mockResolvedValue({
      id: 'job-cancelled',
      status: 'CANCELLED',
      currentRiderId: null,
      assignments: [
        { riderProfileId: 'rider-owned', status: 'ACCEPTED' },
      ],
      pickupProof: null,
      deliveryProof: null,
    });

    await expect(
      service.historyDetail('user-owned', 'job-cancelled'),
    ).resolves.toMatchObject({ receiptAvailable: true });
    expect(read.historyDetail).not.toHaveBeenCalled();
  });

  it('rejects a delivered job completed by another Rider after reassignment', async () => {
    (prisma.deliveryJob.findFirst as jest.Mock).mockResolvedValue({
      id: 'job-delivered',
      status: 'DELIVERED',
      currentRiderId: 'rider-new',
      assignments: [
        { riderProfileId: 'rider-owned', status: 'REASSIGNED' },
      ],
      pickupProof: { riderId: 'rider-owned' },
      deliveryProof: { riderId: 'rider-new' },
    });

    await expect(
      service.historyDetail('user-owned', 'job-delivered'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns only approximate destination context before acceptance', async () => {
    read.offerDetail.mockResolvedValue({
      assignment: {
        id: 'assignment-1',
        status: 'OFFERED',
        offeredAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        deliveryJob: {
          order: {
            customer: { name: 'Private Recipient' },
            addressSnapshot: { phoneE164: '+919999999999' },
          },
        },
      },
      offer: {
        delivery: {
          customerName: 'Private Recipient',
          addressSnapshot: {
            address: '221B Exact Private Street',
            phoneE164: '+919999999999',
            recipientName: 'Private Recipient',
            locality: 'MVP Colony',
            city: 'Visakhapatnam',
            state: 'Andhra Pradesh',
          },
          latitude: 17.72,
          longitude: 83.31,
        },
        specialHandling: 'Call 9999999999 at the blue gate',
        payout: { totalPaise: 5000 },
      },
    });

    const result = await service.offerDetail('user-owned', 'assignment-1');
    const serialized = JSON.stringify(result);

    expect(result.offer.delivery).toEqual({
      area: 'MVP Colony',
      city: 'Visakhapatnam',
      state: 'Andhra Pradesh',
      approximate: true,
    });
    expect(serialized).not.toContain('221B Exact Private Street');
    expect(serialized).not.toContain('9999999999');
    expect(serialized).not.toContain('addressSnapshot');
    expect(serialized).not.toContain('deliveryJob');
  });

  it('disables unbound private contact while retaining safety escalation', async () => {
    await expect(
      service.contact('user-owned', 'job-1', {
        targetRole: 'CUSTOMER',
        channel: 'CALL',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    read.contact.mockResolvedValue({ status: 'ESCALATED' });
    await expect(
      service.contact('user-owned', 'job-1', {
        targetRole: 'CUSTOMER',
        channel: 'SAFETY_ESCALATION',
      }),
    ).resolves.toEqual({ status: 'ESCALATED' });
  });
});
