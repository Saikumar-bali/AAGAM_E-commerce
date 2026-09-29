/**
 * Shared types and constants for delivery operations.
 *
 * Split out of the former delivery-operations.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { Prisma, Role, prisma } from "@aagam/database";
import { DeliveryJobStatus } from "@aagam/types";

export type DbClient = Prisma.TransactionClient | typeof prisma;
export type Actor = { id: string; role: Role };
export type DeliveryCommitHook = (tx: Prisma.TransactionClient) => Promise<void>;

export type DeliveryOperationType =
  | "OTP_ISSUED"
  | "OTP_ATTEMPT_FAILED"
  | "OTP_VERIFIED"
  | "DELIVERY_FAILURE_RECORDED"
  | "RETURN_STARTED"
  | "RETURN_CONFIRMED"
  | "RETURN_INSPECTION_COMPLETED"
  | "COD_COLLECTED"
  | "COD_SETTLED"
  | "PICKUP_CHALLENGE_ISSUED"
  | "PICKUP_VERIFIED"
  | "DELIVERY_PROOF_RECORDED"
  | "FAILURE_RESOLUTION_DECIDED"
  | "FAILURE_RESOLUTION_APPLIED"
  | "COD_VARIANCE_RECORDED";

export type DeliveryOperationStatus =
  | "PENDING"
  | "COMPLETED"
  | "FAILED"
  | "SUPERSEDED";

export type DeliveryOperationRow = {
  id: string;
  deliveryJobId: string;
  orderId: string;
  type: DeliveryOperationType;
  status: DeliveryOperationStatus;
  actorUserId: string | null;
  actorRole: Role | null;
  idempotencyKey: string;
  details: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
};

export type OperationInput = {
  deliveryJobId: string;
  orderId: string;
  type: DeliveryOperationType;
  status?: DeliveryOperationStatus;
  actor?: Actor | null;
  idempotencyKey: string;
  details?: Record<string, unknown>;
};

export const FAILURE_STATUSES = new Set<string>([
  DeliveryJobStatus.RIDER_EN_ROUTE_TO_STORE,
  DeliveryJobStatus.RIDER_AT_STORE,
  DeliveryJobStatus.OUT_FOR_DELIVERY,
  DeliveryJobStatus.RIDER_AT_CUSTOMER,
]);
export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const PICKUP_TTL_MS = 15 * 60 * 1000;
export const PICKUP_MAX_ATTEMPTS = 5;
