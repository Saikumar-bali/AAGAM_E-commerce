import { ConflictException } from '@nestjs/common';
import { prisma } from '@aagam/database';
import { CodSettlementFacadeService } from './cod-settlement-facade.service';

jest.mock('@aagam/database', () => {
  const actual = jest.requireActual('@aagam/database');
  return {
    ...actual,
    prisma: {
      codLedger: { findFirst: jest.fn() },
      codLedgerEntry: { findFirst: jest.fn() },
    },
  };
});

describe('CodSettlementFacadeService', () => {
  const settleCod = jest.fn();
  const service = new CodSettlementFacadeService({ settleCod } as any);
  const ledgerFindFirst = prisma.codLedger.findFirst as jest.Mock;
  const entryFindFirst = prisma.codLedgerEntry.findFirst as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    ledgerFindFirst.mockResolvedValue(null);
    entryFindFirst.mockResolvedValue(null);
  });

  it('rejects a current ledger reference already used by another job', async () => {
    ledgerFindFirst.mockResolvedValue({ id: 'ledger-other', deliveryJobId: 'job-other' });

    await expect(service.settle(
      'job-1',
      { id: 'admin-1', role: 'ADMIN' },
      { amountPaise: 1000, settlementReference: 'SETTLEMENT-001' },
      'caller-key-1',
    )).rejects.toBeInstanceOf(ConflictException);

    expect(settleCod).not.toHaveBeenCalled();
  });

  it('rejects a historical deposited-entry reference from another job', async () => {
    entryFindFirst.mockResolvedValue({
      amountPaise: 1000,
      codLedger: { deliveryJobId: 'job-other' },
    });

    await expect(service.settle(
      'job-1',
      { id: 'admin-1', role: 'ADMIN' },
      { amountPaise: 1000, settlementReference: 'SETTLEMENT-HISTORICAL' },
    )).rejects.toBeInstanceOf(ConflictException);
  });

  it('uses the same deterministic key for same-job retries with different headers', async () => {
    settleCod.mockResolvedValue({ id: 'operation-1' });

    await service.settle(
      'job-1',
      { id: 'admin-1', role: 'ADMIN' },
      { amountPaise: 1000, settlementReference: '  SETTLEMENT-002  ' },
      'caller-key-1',
    );
    const firstKey = settleCod.mock.calls[0][3];

    await service.settle(
      'job-1',
      { id: 'admin-1', role: 'ADMIN' },
      { amountPaise: 1000, settlementReference: 'SETTLEMENT-002' },
      'caller-key-2',
    );
    const secondKey = settleCod.mock.calls[1][3];

    expect(firstKey).toBe(secondKey);
    expect(firstKey).toMatch(/^cod-settled:job-1:[a-f0-9]{64}$/);
    expect(settleCod).toHaveBeenLastCalledWith(
      'job-1',
      { id: 'admin-1', role: 'ADMIN' },
      { amountPaise: 1000, settlementReference: 'SETTLEMENT-002' },
      firstKey,
    );
  });

  it('allows an exact same-job reference retry but rejects a changed amount', async () => {
    entryFindFirst.mockResolvedValue({
      amountPaise: 1000,
      codLedger: { deliveryJobId: 'job-1' },
    });
    settleCod.mockResolvedValue({ id: 'operation-1' });

    await expect(service.settle(
      'job-1',
      { id: 'admin-1', role: 'ADMIN' },
      { amountPaise: 1000, settlementReference: 'SETTLEMENT-003' },
    )).resolves.toEqual({ id: 'operation-1' });

    await expect(service.settle(
      'job-1',
      { id: 'admin-1', role: 'ADMIN' },
      { amountPaise: 2000, settlementReference: 'SETTLEMENT-003' },
    )).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps a database uniqueness race to a professional conflict', async () => {
    settleCod.mockRejectedValue({ code: 'P2002' });

    await expect(service.settle(
      'job-1',
      { id: 'admin-1', role: 'ADMIN' },
      { amountPaise: 1000, settlementReference: 'SETTLEMENT-004' },
    )).rejects.toBeInstanceOf(ConflictException);
  });
});
