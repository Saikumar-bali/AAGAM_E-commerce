import { Injectable } from '@nestjs/common';
import { prisma, Role } from '@aagam/database';
import {
  DeliveryEventTypeType,
  DeliveryJobStatusType,
} from '@aagam/types';

type DbClient = typeof prisma | any;

type DeliveryEventInput = {
  deliveryJobId: string;
  assignmentId?: string | null;
  eventType: DeliveryEventTypeType;
  fromStatus?: DeliveryJobStatusType | null;
  toStatus?: DeliveryJobStatusType | null;
  actor?: { id?: string | null; role?: Role | null } | null;
  metadata?: Record<string, unknown> | null;
};

@Injectable()
export class DeliveryEventService {
  record(input: DeliveryEventInput, tx: DbClient = prisma) {
    return tx.deliveryEvent.create({
      data: {
        deliveryJobId: input.deliveryJobId,
        assignmentId: input.assignmentId || null,
        eventType: input.eventType,
        fromStatus: input.fromStatus || null,
        toStatus: input.toStatus || null,
        actorUserId: input.actor?.id || null,
        actorRole: input.actor?.role || null,
        metadata: input.metadata || undefined,
      },
    });
  }

  listForJob(deliveryJobId: string) {
    return prisma.deliveryEvent.findMany({
      where: { deliveryJobId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
