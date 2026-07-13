import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { Role } from "@aagam/database";
import { DeliveryJobStatusType, DeliveryProofDto } from "@aagam/types";
import { DeliveryJobService } from "./delivery-job.service";
import { DeliveryOperationsService } from "./delivery-operations.service";
import { DispatchAssignmentService } from "./dispatch-assignment.service";
import { DeliveryWorkflowService } from "./delivery-workflow.service";

type Actor = { id: string; role: Role };

@Injectable()
export class DispatchService {
  constructor(
    private readonly jobs: DeliveryJobService,
    private readonly assignments: DispatchAssignmentService,
    private readonly workflow: DeliveryWorkflowService,
    @Optional() private readonly operations?: DeliveryOperationsService
  ) {}

  getBoard(actor: Actor) {
    return this.jobs.getBoard(actor);
  }

  getRiderWorkspace(riderUserId: string) {
    return this.jobs.getRiderWorkspace(riderUserId);
  }

  offerAssignment(
    deliveryJobId: string,
    riderUserId: string,
    actor: Actor,
    expiresInSeconds?: number
  ) {
    return this.assignments.offer(
      deliveryJobId,
      riderUserId,
      actor,
      expiresInSeconds
    );
  }

  acceptOffer(assignmentId: string, riderUserId: string) {
    return this.assignments.accept(assignmentId, riderUserId);
  }

  rejectOffer(assignmentId: string, riderUserId: string, reason?: string) {
    return this.assignments.reject(assignmentId, riderUserId, reason);
  }

  transitionJob(
    deliveryJobId: string,
    nextStatus: DeliveryJobStatusType,
    actor: Actor,
    metadata?: Record<string, unknown>
  ) {
    return this.workflow.transition(deliveryJobId, nextStatus, actor, metadata);
  }

  // Compatibility adapter retained for the current admin/store dispatch client.
  assignPackedOrder(orderId: string, riderUserId: string, actor: Actor) {
    return this.assignments.offerForOrder(orderId, riderUserId, actor);
  }

  // Compatibility adapter retained while clients migrate from order IDs to
  // assignment IDs.
  async acceptAssignment(orderId: string, riderUserId: string) {
    const assignment = await this.assignments.findCurrentForOrderAndRider(
      orderId,
      riderUserId
    );
    return this.assignments.accept(assignment.id, riderUserId);
  }

  async rejectAssignment(
    orderId: string,
    riderUserId: string,
    reason?: string
  ) {
    const assignment = await this.assignments.findCurrentForOrderAndRider(
      orderId,
      riderUserId
    );
    return this.assignments.reject(assignment.id, riderUserId, reason);
  }

  async markPickedUp(orderId: string, riderUserId: string) {
    const assignment = await this.assignments.findCurrentForOrderAndRider(
      orderId,
      riderUserId
    );
    if (!assignment.deliveryJob)
      throw new NotFoundException("Delivery job not found");
    if (assignment.status !== "ACCEPTED") {
      throw new ForbiddenException("Accept the assignment before pickup");
    }
    await this.workflow.legacyPickup(assignment.deliveryJob.id, {
      id: riderUserId,
      role: Role.RIDER,
    });
    const detailedJob = await this.jobs.getByOrderId(orderId);
    if (!detailedJob)
      throw new NotFoundException("Delivery job not found after pickup");
    return { ...detailedJob.order, deliveryJob: detailedJob };
  }

  async markDelivered(
    orderId: string,
    riderUserId: string,
    proof: DeliveryProofDto
  ) {
    const assignment = await this.assignments.findCurrentForOrderAndRider(
      orderId,
      riderUserId
    );
    if (!assignment.deliveryJob)
      throw new NotFoundException("Delivery job not found");

    if (this.operations) {
      await this.operations.completeDelivery(
        assignment.deliveryJob.id,
        { id: riderUserId, role: Role.RIDER },
        {
          otpCode: proof.code,
          proofType: proof.proofType,
          note: proof.note,
          riderConfirmed: proof.riderConfirmed,
          latitude: proof.latitude,
          longitude: proof.longitude,
          accuracyMetres: proof.accuracyMetres,
        },
        `legacy-deliver:${assignment.deliveryJob.id}:${assignment.id}`
      );
    } else {
      // Used only by isolated legacy unit construction. Production Nest wiring
      // always injects DeliveryOperationsService and enforces Phase 3 gates.
      await this.workflow.legacyDeliver(
        assignment.deliveryJob.id,
        { id: riderUserId, role: Role.RIDER },
        proof
      );
    }

    const detailedJob = await this.jobs.getByOrderId(orderId);
    if (!detailedJob)
      throw new NotFoundException("Delivery job not found after completion");
    return { ...detailedJob.order, deliveryJob: detailedJob };
  }
}
