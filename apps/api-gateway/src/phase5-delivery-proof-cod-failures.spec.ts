import { ValidationPipe } from "@nestjs/common";
import { readFileSync } from "fs";
import path from "path";
import { DeliveryResolutionAction } from "@aagam/database";
import { decideFailureResolution } from "./orders/delivery-failure-policy";
import {
  CompleteDeliveryOperationDto,
  DeliveryFailureReason,
  IssuePickupChallengeDto,
  RecordDeliveryFailureDto,
  VerifyPickupProofDto,
} from "./orders/delivery-operations.dto";

describe("Phase 5 pickup, delivery proof, COD, and failed-delivery gate", () => {
  const root = path.resolve(__dirname, "../../..");
  const api = (file: string) =>
    readFileSync(path.join(__dirname, file), "utf8");
  const repo = (file: string) => readFileSync(path.join(root, file), "utf8");
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  it("supports exactly the controlled Phase 5 failure reasons", () => {
    expect(Object.values(DeliveryFailureReason)).toEqual([
      "CUSTOMER_UNREACHABLE",
      "CUSTOMER_REFUSED",
      "ADDRESS_NOT_FOUND",
      "WRONG_ADDRESS",
      "PAYMENT_NOT_AVAILABLE",
      "VEHICLE_BREAKDOWN",
      "PACKAGE_DAMAGED",
      "SAFETY_CONCERN",
      "OTHER",
    ]);
  });

  it("makes a deterministic, versioned system decision for every failure reason", () => {
    const expected = {
      CUSTOMER_UNREACHABLE: DeliveryResolutionAction.RETRY_DELIVERY,
      CUSTOMER_REFUSED: DeliveryResolutionAction.RETURN_TO_STORE,
      ADDRESS_NOT_FOUND: DeliveryResolutionAction.ESCALATE_TO_ADMIN,
      WRONG_ADDRESS: DeliveryResolutionAction.ESCALATE_TO_ADMIN,
      PAYMENT_NOT_AVAILABLE: DeliveryResolutionAction.RETRY_DELIVERY,
      VEHICLE_BREAKDOWN: DeliveryResolutionAction.REASSIGN_RIDER,
      PACKAGE_DAMAGED: DeliveryResolutionAction.RETURN_TO_STORE,
      SAFETY_CONCERN: DeliveryResolutionAction.ESCALATE_TO_ADMIN,
      OTHER: DeliveryResolutionAction.ESCALATE_TO_ADMIN,
    };
    for (const reason of Object.values(DeliveryFailureReason)) {
      const decision = decideFailureResolution(reason);
      expect(decision.action).toBe(expected[reason]);
      expect(decision.policyVersion).toBe("phase5-v1");
      expect(decision.rationale.length).toBeGreaterThan(20);
    }
  });

  it("validates professional pickup challenge and proof payloads", async () => {
    await expect(
      pipe.transform({ method: "STORE_PICKUP_PIN", parcelCount: 2 }, {
        type: "body",
        metatype: IssuePickupChallengeDto,
      } as any)
    ).resolves.toMatchObject({ parcelCount: 2 });
    await expect(
      pipe.transform(
        {
          method: "QR_CODE",
          code: "AAGAM-PICKUP-proof",
          parcelCount: 2,
          latitude: 17.7,
        },
        { type: "body", metatype: VerifyPickupProofDto } as any
      )
    ).resolves.toBeDefined();
    await expect(
      pipe.transform({ method: "QR_CODE", code: "x", parcelCount: 0 }, {
        type: "body",
        metatype: VerifyPickupProofDto,
      } as any)
    ).rejects.toBeDefined();
  });

  it("requires Rider confirmation and a six-digit customer OTP/PIN", async () => {
    await expect(
      pipe.transform(
        { otpCode: "123456", riderConfirmed: true, note: "Handed to customer" },
        { type: "body", metatype: CompleteDeliveryOperationDto } as any
      )
    ).resolves.toBeDefined();
    await expect(
      pipe.transform({ otpCode: "123456" }, {
        type: "body",
        metatype: CompleteDeliveryOperationDto,
      } as any)
    ).rejects.toBeDefined();
  });

  it("rejects uncontrolled failure strings at the API boundary", async () => {
    await expect(
      pipe.transform({ reason: "CUSTOMER_UNAVAILABLE", note: "legacy value" }, {
        type: "body",
        metatype: RecordDeliveryFailureDto,
      } as any)
    ).rejects.toBeDefined();
  });

  it("persists separate pickup proof, delivery proof, COD ledger, and failure decisions", () => {
    const schema = repo("packages/database/prisma/schema.prisma");
    for (const model of [
      "model PickupChallenge",
      "model PickupProof",
      "model DeliveryProof",
      "model CodLedger",
      "model CodLedgerEntry",
      "model DeliveryFailureDecision",
    ])
      expect(schema).toContain(model);
    expect(schema).toContain("riderHoldingBalancePaise");
    expect(schema).toContain("variancePaise");
    expect(schema).not.toContain("earnings                 CodLedger");
  });

  it("removes generic pickup completion and routes proof through role-scoped endpoints", () => {
    const dispatch = api("orders/dispatch.controller.ts");
    const operations = api("orders/delivery-operations.controller.ts");
    expect(dispatch).toContain("this.operations.confirmStorePickup");
    expect(dispatch).not.toContain(
      "DeliveryJobStatus.PICKUP_VERIFIED, req.user"
    );
    expect(operations).toContain("pickup/challenge");
    expect(operations).toContain("pickup/verify");
    expect(operations).toContain("pickup/confirm");
    expect(operations).toContain("failure-resolution");
  });

  it("keeps OTP secrets out of Rider and operations summary responses", () => {
    const operations = api("orders/delivery-operations.service.ts");
    const rider = api("riders/rider-portal.service.ts");
    expect(operations).toContain("delete details.codeHash");
    expect(rider).toContain("THEN \"details\" - 'nonce' - 'salt' - 'codeHash'");
  });

  it("renders Rider, Store, and Admin Phase 5 controls without mixing earnings into COD", () => {
    const riderDelivery = repo(
      "apps/admin-dashboard/src/app/(rider)/rider/delivery/page.tsx"
    );
    const riderPickup = repo(
      "apps/admin-dashboard/src/app/(rider)/rider/pickup/page.tsx"
    );
    const riderCod = repo(
      "apps/admin-dashboard/src/app/(rider)/rider/cod/page.tsx"
    );
    const storePickup = repo(
      "apps/admin-dashboard/src/app/(store)/store/pickup-proof/page.tsx"
    );
    const admin = repo(
      "apps/admin-dashboard/src/app/(admin)/admin/delivery-exceptions/page.tsx"
    );
    expect(riderDelivery).toContain("CUSTOMER_OTP_PIN");
    expect(riderPickup).toContain("STORE_PICKUP_PIN");
    expect(storePickup).toContain("Confirm store handoff");
    expect(admin).toContain("System failure resolution");
    expect(riderCod).toContain("Rider earnings never enter this ledger");
    expect(riderCod).not.toContain("/riders/portal/earnings");
  });
});
