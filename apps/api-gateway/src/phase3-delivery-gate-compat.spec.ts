import { Role } from "@aagam/database";
import { ROLES_KEY } from "./auth/decorators/roles.decorator";
import { DeliveryOperationsController } from "./orders/delivery-operations.controller";
import { DispatchController } from "./orders/dispatch.controller";
import { DispatchService } from "./orders/dispatch.service";

describe("Phase 3 delivery completion compatibility gates", () => {
  it("restricts plaintext OTP retrieval to the customer role", () => {
    const allowedRoles = Reflect.getMetadata(
      ROLES_KEY,
      DeliveryOperationsController.prototype.customerOtp
    );
    expect(allowedRoles).toEqual([Role.CUSTOMER]);
  });

  it("routes the job-based delivered endpoint through DeliveryOperationsService", async () => {
    const dispatch = {} as any;
    const operations = {
      completeDelivery: jest.fn(async () => ({
        id: "job-1",
        status: "DELIVERED",
      })),
    };
    const controller = new DispatchController(dispatch, operations as any);

    await controller.delivered(
      "job-1",
      {
        proofType: "CUSTOMER_OTP_PIN",
        code: "123456",
        riderConfirmed: true,
        note: "Verified handoff",
      },
      { user: { id: "rider-user-1", role: Role.RIDER } },
      "request-key-1"
    );

    expect(operations.completeDelivery).toHaveBeenCalledWith(
      "job-1",
      { id: "rider-user-1", role: Role.RIDER },
      {
        otpCode: "123456",
        proofType: "CUSTOMER_OTP_PIN",
        note: "Verified handoff",
        riderConfirmed: true,
        latitude: undefined,
        longitude: undefined,
        accuracyMetres: undefined,
      },
      "request-key-1"
    );
  });

  it("routes the order-based legacy adapter through DeliveryOperationsService", async () => {
    const jobs = {
      getByOrderId: jest.fn(async () => ({
        id: "job-1",
        order: { id: "order-1", status: "DELIVERED" },
      })),
    };
    const assignments = {
      findCurrentForOrderAndRider: jest.fn(async () => ({
        id: "assignment-1",
        deliveryJob: { id: "job-1" },
      })),
    };
    const workflow = { legacyDeliver: jest.fn() };
    const operations = {
      completeDelivery: jest.fn(async () => ({
        id: "job-1",
        status: "DELIVERED",
      })),
    };
    const service = new DispatchService(
      jobs as any,
      assignments as any,
      workflow as any,
      operations as any
    );

    const result = await service.markDelivered("order-1", "rider-user-1", {
      proofType: "CUSTOMER_OTP_PIN",
      code: "654321",
      riderConfirmed: true,
    });

    expect(operations.completeDelivery).toHaveBeenCalledWith(
      "job-1",
      { id: "rider-user-1", role: Role.RIDER },
      {
        otpCode: "654321",
        proofType: "CUSTOMER_OTP_PIN",
        note: undefined,
        riderConfirmed: true,
        latitude: undefined,
        longitude: undefined,
        accuracyMetres: undefined,
      },
      "legacy-deliver:job-1:assignment-1"
    );
    expect(workflow.legacyDeliver).not.toHaveBeenCalled();
    expect(result.deliveryJob.id).toBe("job-1");
  });
});
