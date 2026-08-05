import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma, Role } from '@aagam/database';
import { assertRiderEligibleForOperations } from '../riders/rider-operations-eligibility';
import { DeliveryEventService } from './delivery-event.service';
import { DeliveryJobService } from './delivery-job.service';
import { DeliveryWorkflowService } from './delivery-workflow.service';
import { DispatchAssignmentService } from './dispatch-assignment.service';

type Actor = { id: string; role: Role };

@Injectable()
export class EligibleDispatchAssignmentService extends DispatchAssignmentService {
  constructor(
    jobs: DeliveryJobService,
    workflow: DeliveryWorkflowService,
    events: DeliveryEventService,
    autoDispatch?: any,
  ) {
    super(jobs, workflow, events, autoDispatch);
  }

  private async assertUserEligible(riderUserId: string) {
    const rider = await prisma.riderProfile.findUnique({
      where: { userId: riderUserId },
      select: { id: true },
    });
    if (!rider) throw new NotFoundException('Rider profile not found');
    await assertRiderEligibleForOperations(prisma, rider.id);
  }

  override async offer(
    deliveryJobId: string,
    riderUserId: string,
    actor: Actor,
    expiresInSeconds = 60,
  ) {
    await this.assertUserEligible(riderUserId);
    return super.offer(
      deliveryJobId,
      riderUserId,
      actor,
      expiresInSeconds,
    );
  }

  override async accept(assignmentId: string, riderUserId: string) {
    await this.assertUserEligible(riderUserId);
    return super.accept(assignmentId, riderUserId);
  }
}
