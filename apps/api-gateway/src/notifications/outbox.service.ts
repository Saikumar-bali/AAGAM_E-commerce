import { Injectable } from '@nestjs/common';
import { prisma } from '@aagam/database';
import { NotificationEventTypeType, NotificationOutboxPayloadDto } from '@aagam/types';

type DbClient = typeof prisma | any;

export type EnqueueOutboxInput = {
  eventType: NotificationEventTypeType;
  aggregateType: 'ORDER' | 'DELIVERY_JOB' | 'ASSIGNMENT' | 'SYSTEM';
  aggregateId: string;
  payload: NotificationOutboxPayloadDto;
  idempotencyKey: string;
  availableAt?: Date;
};

export async function enqueueOutboxEvent(
  tx: DbClient,
  input: EnqueueOutboxInput,
) {
  try {
    return await tx.outboxEvent.create({
      data: {
        eventType: input.eventType,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        payload: input.payload,
        idempotencyKey: input.idempotencyKey,
        availableAt: input.availableAt || new Date(),
      },
    });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return tx.outboxEvent.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    }
    throw error;
  }
}

@Injectable()
export class OutboxService {
  enqueue(input: EnqueueOutboxInput, tx: DbClient = prisma) {
    return enqueueOutboxEvent(tx, input);
  }

  async claimBatch(limit = 20) {
    const now = new Date();
    const staleLock = new Date(now.getTime() - 5 * 60 * 1000);

    await prisma.outboxEvent.updateMany({
      where: { status: 'PROCESSING', lockedAt: { lt: staleLock } },
      data: {
        status: 'FAILED',
        lockedAt: null,
        availableAt: now,
        lastError: 'Recovered stale processing lock',
      },
    });

    const candidates = await prisma.outboxEvent.findMany({
      where: {
        status: { in: ['PENDING', 'FAILED'] },
        availableAt: { lte: now },
        attempts: { lt: 5 },
      },
      orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
      take: Math.max(1, Math.min(100, limit)),
    });

    const claimed = [] as any[];
    for (const candidate of candidates) {
      const updated = await prisma.outboxEvent.updateMany({
        where: {
          id: candidate.id,
          status: { in: ['PENDING', 'FAILED'] },
          availableAt: { lte: now },
          attempts: candidate.attempts,
        },
        data: {
          status: 'PROCESSING',
          attempts: { increment: 1 },
          lockedAt: now,
          lastError: null,
        },
      });
      if (updated.count === 1) {
        const row = await prisma.outboxEvent.findUnique({ where: { id: candidate.id } });
        if (row) claimed.push(row);
      }
    }
    return claimed;
  }

  markProcessed(id: string) {
    return prisma.outboxEvent.update({
      where: { id },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
        lockedAt: null,
        lastError: null,
      },
    });
  }

  async markFailed(id: string, error: unknown) {
    const event = await prisma.outboxEvent.findUnique({ where: { id } });
    if (!event) return null;
    const delaySeconds = Math.min(300, Math.pow(2, Math.max(0, event.attempts - 1)) * 10);
    return prisma.outboxEvent.update({
      where: { id },
      data: {
        status: 'FAILED',
        lockedAt: null,
        availableAt: new Date(Date.now() + delaySeconds * 1000),
        lastError: error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000),
      },
    });
  }

  listRecent(limit = 100) {
    return prisma.outboxEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(500, limit)),
      include: {
        notification: {
          include: { recipients: { select: { status: true } } },
        },
      },
    });
  }
}
