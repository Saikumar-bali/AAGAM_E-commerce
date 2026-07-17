import {
  CouponDiscountType,
  CouponStatus,
} from "@aagam/database";
import { AdminPromotionsController } from "./promotions.controller";

function createController() {
  const service = {
    createCoupon: jest.fn().mockResolvedValue({ id: "coupon-1" }),
  };
  return {
    service,
    controller: new AdminPromotionsController(service as any),
  };
}

describe("AdminPromotionsController coupon publishing", () => {
  test("publishes a newly placed draft coupon immediately", async () => {
    const { controller, service } = createController();

    await controller.createCoupon(
      { user: { id: "admin-1" } },
      {
        code: "WELCOME10",
        name: "Welcome offer",
        status: CouponStatus.DRAFT,
        discountType: CouponDiscountType.PERCENTAGE,
        percentageBps: 1000,
      }
    );

    expect(service.createCoupon).toHaveBeenCalledWith(
      "admin-1",
      expect.objectContaining({ status: CouponStatus.ACTIVE })
    );
  });

  test("schedules a newly placed coupon whose start time is in the future", async () => {
    const { controller, service } = createController();

    await controller.createCoupon(
      { user: { id: "admin-1" } },
      {
        code: "FUTURE10",
        name: "Future offer",
        status: CouponStatus.DRAFT,
        startsAt: "2099-01-01T00:00:00.000Z",
        discountType: CouponDiscountType.PERCENTAGE,
        percentageBps: 1000,
      }
    );

    expect(service.createCoupon).toHaveBeenCalledWith(
      "admin-1",
      expect.objectContaining({ status: CouponStatus.SCHEDULED })
    );
  });

  test("preserves an explicit paused or archived lifecycle state", async () => {
    const { controller, service } = createController();

    await controller.createCoupon(
      { user: { id: "admin-1" } },
      {
        code: "PAUSED10",
        name: "Paused offer",
        status: CouponStatus.PAUSED,
        discountType: CouponDiscountType.PERCENTAGE,
        percentageBps: 1000,
      }
    );

    expect(service.createCoupon).toHaveBeenCalledWith(
      "admin-1",
      expect.objectContaining({ status: CouponStatus.PAUSED })
    );
  });
});
