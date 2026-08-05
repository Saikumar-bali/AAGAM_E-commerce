import { ConflictException, Injectable } from '@nestjs/common';
import { CodLedgerEntryType, prisma } from '@aagam/database';
import { createHash } from 'crypto';
import { SettleCodDto } from './delivery-operations.dto';
import { DeliveryOperationsService } from './delivery-operations.service';

@Injectable()
export class CodSettlementFacadeService {
  constructor(private readonly operations: DeliveryOperationsService) {}

  async settle(
    deliveryJobId: string,
    actor: any,
    input: SettleCodDto,
    _idempotencyKey?: string,
  ) {
    const settlementReference = input.settlementReference.trim();
    const deterministicKey = `cod-settled:${deliveryJobId}:${createHash('sha256')
      .update(settlementReference)
      .digest('hex')}`;

    const [conflictingLedger, depositedEntry] = await Promise.all([
      prisma.codLedger.findFirst({
        where: {
          settlementReference,
          NOT: { deliveryJobId },
        },
        select: { id: true, deliveryJobId: true },
      }),
      prisma.codLedgerEntry.findFirst({
        where: {
          type: CodLedgerEntryType.DEPOSITED,
          reference: settlementReference,
        },
        select: {
          amountPaise: true,
          codLedger: { select: { deliveryJobId: true } },
        },
      }),
    ]);

    if (
      conflictingLedger ||
      (depositedEntry && depositedEntry.codLedger.deliveryJobId !== deliveryJobId)
    ) {
      throw new ConflictException(
        'Settlement reference is already attached to another COD deposit',
      );
    }
    if (depositedEntry && depositedEntry.amountPaise !== input.amountPaise) {
      throw new ConflictException(
        'Settlement reference was already used with a different deposit amount',
      );
    }

    try {
      return await this.operations.settleCod(
        deliveryJobId,
        actor,
        { ...input, settlementReference },
        deterministicKey,
      );
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === 'P2002'
      ) {
        throw new ConflictException(
          'Settlement reference is already attached to another COD deposit',
        );
      }
      throw error;
    }
  }
}
