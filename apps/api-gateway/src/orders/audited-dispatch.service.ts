import { Inject, Injectable, Optional } from '@nestjs/common';
import { DeliveryJobStatusType } from '@aagam/types';
import { DeliveryJobService } from './delivery-job.service';
import { DeliveryOperationsService } from './delivery-operations.service';
import { DispatchAssignmentService } from './dispatch-assignment.service';
import { DispatchService } from './dispatch.service';
import { DeliveryWorkflowService } from './delivery-workflow.service';

type Actor = {
  id: string;
  role: any;
  arrivalEvidence?: Record<string, unknown>;
};

@Injectable()
export class AuditedDispatchService extends DispatchService {
  constructor(
    @Inject(DeliveryJobService) jobs: DeliveryJobService,
    @Optional() @Inject(DispatchAssignmentService) assignments?: DispatchAssignmentService,
    @Optional() @Inject(DeliveryWorkflowService) workflow?: DeliveryWorkflowService,
    @Optional() @Inject(DeliveryOperationsService) operations?: DeliveryOperationsService,
  ) {
    super(jobs, assignments, workflow, operations);
  }

  override transitionJob(
    deliveryJobId: string,
    nextStatus: DeliveryJobStatusType,
    actor: Actor,
    metadata?: Record<string, unknown>,
  ) {
    return super.transitionJob(
      deliveryJobId,
      nextStatus,
      actor,
      actor.arrivalEvidence
        ? { ...(metadata || {}), arrivalEvidence: actor.arrivalEvidence }
        : metadata,
    );
  }
}
