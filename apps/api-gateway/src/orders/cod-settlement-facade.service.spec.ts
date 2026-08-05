import { ConflictException } from '@nestjs/common';
import { prisma } from '@aagam/database';
import { CodSettlementFacadeService } from './cod-settlement-facade.service';

jest.mock('@aagam/database', () => {
  const actual = jest.requireActual('@aagam/database');
  return {
    ...actual,
    prisma: {
      codLedger: {
        findFirst: jest.fn(),
      },
    },
  };
});

describe('CodSettlementFacadeService', () => {
  const settleCod = jest.fn();
  const service = new CodSettlementFacadeService({ settleCod } as any);
  const findFirst = prisma.codLedger.findFirst as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects a settlement reference already used by another job', async () => {
    findFirst.mockResolvedValue({ id: 'ledger-other', deliveryJobId: 'job-other' });

    await expect(service.settle(
      'job-1',
      { id: 'admin-1', role: 'ADMIN' },
      { amountPaise: 1000, settlementReference: 'SETTLEMENT-001' },
      'idempotency-1',
    )).rejects.toBeInstanceOf(ConflictException);

    expect(settleCod).not.toHaveBeenCalled();
  });

  it('trims and delegates an unused settlement reference', async () => {
    findFirst.mockResolvedValue(null);
    settleCod.mockResolvedValue({ id: 'ledger-1' });

    await expect(service.settle(
      'job-1',
      { id: 'admin-1', role: 'ADMIN' },
      { amountPaise: 1000, settlementReference: '  SETTLEMENT-002  ' },
      'idempotency-2',
    )).resolves.toEqual({ id: 'ledger-1' });

    expect(settleCod).toHaveBeenCalledWith(
      'job-1',
      { id: 'admin-1', role: 'ADMIN' },
      { amountPaise: 1000, settlementReference: 'SETTLEMENT-002' },
      'idempotency-2',
    );
  });

  it('maps a database uniqueness race to a professional conflict', async () => {
    findFirst.mockResolvedValue(null);
    settleCod.mockRejectedValue({ code: 'P2002' });

    await expect(service.settle(
      'job-1',
      { id: 'admin-1', role: 'ADMIN' },
      { amountPaise: 1000, settlementReference: 'SETTLEMENT-003' },
    )).rejects.toBeInstanceOf(ConflictException);
  });
});
