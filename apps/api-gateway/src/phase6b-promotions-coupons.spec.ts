import {
  CouponApplicationMode,
  CouponDiscountType,
  CouponEligibilityScope,
  CouponRedemptionStatus,
  CouponStatus,
  PaymentMethod,
  PromotionPlacement,
  PromotionStatus,
  PromotionTargetType,
  Role,
  prisma,
} from "@aagam/database";
import { CheckoutService } from "./checkout/checkout.service";
import { PaymentsService } from "./payments/payments.service";
import { PromotionsService } from "./promotions/promotions.service";

const PREFIX = "_test_phase6b_promotions_";
const CODE_PREFIX = "P6B";

const gatewayMock = () => ({
  server: { to: jest.fn().mockReturnThis(), emit: jest.fn() },
});
const notificationMock = () => ({
  sendNewOrderAlert: jest.fn().mockResolvedValue(undefined),
});

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { contains: PREFIX } },
    select: { id: true },
  });
  const userIds = users.map((item) => item.id);
  const stores = await prisma.store.findMany({
    where: { name: { contains: PREFIX } },
    select: { id: true },
  });
  const storeIds = stores.map((item) => item.id);
  const products = await prisma.product.findMany({
    where: { name: { contains: PREFIX } },
    select: { id: true },
  });
  const productIds = products.map((item) => item.id);
  const orders = await prisma.order.findMany({
    where: {
      OR: [{ customerId: { in: userIds } }, { storeId: { in: storeIds } }],
    },
    select: { id: true },
  });
  const orderIds = orders.map((item) => item.id);
  const coupons = await prisma.coupon.findMany({
    where: {
      OR: [
        { code: { startsWith: CODE_PREFIX } },
        { code: { startsWith: "PW" } },
      ],
    },
    select: { id: true },
  });
  const couponIds = coupons.map((item) => item.id);

  await prisma.couponRedemption.deleteMany({
    where: {
      OR: [{ orderId: { in: orderIds } }, { couponId: { in: couponIds } }],
    },
  });
  await prisma.promotionPlacementAssignment.deleteMany({
    where: {
      campaign: {
        OR: [
          { internalName: { contains: PREFIX } },
          { internalName: { startsWith: "Playwright dynamic campaign" } },
        ],
      },
    },
  });
  await prisma.promotionCampaign.deleteMany({
    where: {
      OR: [
        { internalName: { contains: PREFIX } },
        { internalName: { startsWith: "Playwright dynamic campaign" } },
      ],
    },
  });
  await prisma.couponProductEligibility.deleteMany({
    where: { couponId: { in: couponIds } },
  });
  await prisma.couponCategoryEligibility.deleteMany({
    where: { couponId: { in: couponIds } },
  });
  await prisma.coupon.deleteMany({ where: { id: { in: couponIds } } });
  await prisma.orderStatusHistory.deleteMany({
    where: { orderId: { in: orderIds } },
  });
  await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.inventoryLedger.deleteMany({
    where: {
      OR: [{ storeId: { in: storeIds } }, { productId: { in: productIds } }],
    },
  });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.inventory.deleteMany({
    where: {
      OR: [{ storeId: { in: storeIds } }, { productId: { in: productIds } }],
    },
  });
  await prisma.customerAddress.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.store.deleteMany({ where: { id: { in: storeIds } } });
  await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  await prisma.category.deleteMany({ where: { name: { contains: PREFIX } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

describe("Phase 6B dynamic promotions and real coupon pricing", () => {
  const promotions = new PromotionsService();
  const checkout = new CheckoutService(
    gatewayMock() as any,
    notificationMock() as any,
    promotions
  );
  const payments = new PaymentsService();
  let admin: any;
  let owner: any;
  let customer: any;
  let store: any;
  let category: any;
  let product: any;
  let address: any;

  beforeAll(async () => {
    await cleanup();
    admin = await prisma.user.create({
      data: {
        email: `${PREFIX}admin@test.com`,
        role: Role.ADMIN,
        name: "Promotion Admin",
      },
    });
    owner = await prisma.user.create({
      data: {
        email: `${PREFIX}owner@test.com`,
        role: Role.STORE_OWNER,
        name: "Promotion Store Owner",
      },
    });
    customer = await prisma.user.create({
      data: {
        email: `${PREFIX}customer@test.com`,
        role: Role.CUSTOMER,
        name: "Promotion Customer",
      },
    });
    store = await prisma.store.create({
      data: {
        name: `${PREFIX}store`,
        address: "Promotion Store Road",
        latitude: 12.9716,
        longitude: 77.5946,
        ownerId: owner.id,
      },
    });
    category = await prisma.category.create({
      data: { name: `${PREFIX}category` },
    });
    product = await prisma.product.create({
      data: {
        name: `${PREFIX}product`,
        price: 500,
        pricePaise: 50_000,
        categoryId: category.id,
      },
    });
    await prisma.inventory.create({
      data: { storeId: store.id, productId: product.id, quantity: 20 },
    });
    address = await prisma.customerAddress.create({
      data: {
        userId: customer.id,
        recipientName: "Promotion Customer",
        phoneE164: "+919100006006",
        line1: "Near Store",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560001",
        latitude: 12.972,
        longitude: 77.595,
      },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  test("Admin campaign scheduling drives exact placements and safe product links", async () => {
    const campaign = await promotions.createCampaign(admin.id, {
      internalName: `${PREFIX}hero`,
      title: "Server controlled fruit offer",
      subtitle: "Visible only while this campaign is active",
      status: PromotionStatus.ACTIVE,
      placements: [
        PromotionPlacement.HOME_HERO,
        PromotionPlacement.HOME_TODAY_OFFERS,
      ],
      targetType: PromotionTargetType.PRODUCT,
      productId: product.id,
      priority: 90,
    });
    const active = await promotions.activeCampaigns(customer.id);
    const hero = active.placements.HOME_HERO.find(c => c.id === campaign.id);
    expect(hero).toBeDefined();
    expect(hero).toMatchObject({
      id: campaign.id,
      targetUrl: `/shop/products/${product.id}`,
    });
    const today = active.placements.HOME_TODAY_OFFERS.find(c => c.id === campaign.id);
    expect(today).toBeDefined();
    expect(today!.id).toBe(campaign.id);
    expect(active.placements.DEALS_PAGE).toEqual([]);
  });

  test("code coupon uses paise pricing, category eligibility, and a real COD redemption", async () => {
    await promotions.createCoupon(admin.id, {
      code: `${CODE_PREFIX}SAVE10`,
      name: "Ten percent test",
      status: CouponStatus.ACTIVE,
      applicationMode: CouponApplicationMode.CODE,
      discountType: CouponDiscountType.PERCENTAGE,
      percentageBps: 1000,
      maxDiscountPaise: 6_000,
      minimumSubtotalPaise: 30_000,
      perCustomerLimit: 1,
      eligibilityScope: CouponEligibilityScope.CATEGORIES,
      eligibleCategoryIds: [category.id],
      storeId: store.id,
    });
    const quote = await checkout.quote(customer.id, {
      addressId: address.id,
      items: [{ productId: product.id, quantity: 1 }],
      couponCode: `${CODE_PREFIX}SAVE10`,
    });
    expect(quote.invoice.subtotalPaise).toBe(50_000);
    expect(quote.invoice.discountPaise).toBe(5_000);
    expect(quote.invoice.grandTotalPaise).toBe(
      quote.invoice.subtotalPaise + quote.invoice.deliveryFeePaise - 5_000
    );
    expect(quote.appliedCoupon?.code).toBe(`${CODE_PREFIX}SAVE10`);

    const order = await checkout.placeOrder(
      customer.id,
      {
        addressId: address.id,
        items: [{ productId: product.id, quantity: 1 }],
        paymentMethod: PaymentMethod.COD,
        couponCode: `${CODE_PREFIX}SAVE10`,
      },
      `${PREFIX}cod-order`
    );
    expect(order.discountPaise).toBe(5_000);
    const redemption = await prisma.couponRedemption.findUnique({
      where: { orderId: order.id },
    });
    expect(redemption).toMatchObject({
      status: CouponRedemptionStatus.REDEEMED,
      codeSnapshot: `${CODE_PREFIX}SAVE10`,
      discountPaise: 5_000,
    });
    await expect(
      checkout.quote(customer.id, {
        addressId: address.id,
        items: [{ productId: product.id, quantity: 1 }],
        couponCode: `${CODE_PREFIX}SAVE10`,
      })
    ).rejects.toThrow("usage limit for this account");
  });

  test("automatic coupon is reserved for online payment and released after failure", async () => {
    await promotions.createCoupon(admin.id, {
      code: `${CODE_PREFIX}AUTO25`,
      name: "Automatic ₹25",
      status: CouponStatus.ACTIVE,
      applicationMode: CouponApplicationMode.AUTO,
      discountType: CouponDiscountType.FIXED_AMOUNT,
      amountPaise: 2_500,
      minimumSubtotalPaise: 10_000,
      perCustomerLimit: 1,
      eligibilityScope: CouponEligibilityScope.ALL,
      priority: 100,
    });
    const quote = await checkout.quote(customer.id, {
      addressId: address.id,
      items: [{ productId: product.id, quantity: 1 }],
    });
    expect(quote.appliedCoupon).toMatchObject({
      code: `${CODE_PREFIX}AUTO25`,
      applicationMode: CouponApplicationMode.AUTO,
    });
    const order = await checkout.placeOrder(
      customer.id,
      {
        addressId: address.id,
        items: [{ productId: product.id, quantity: 1 }],
        paymentMethod: PaymentMethod.ONLINE,
      },
      `${PREFIX}online-order`
    );
    expect(
      (
        await prisma.couponRedemption.findUnique({
          where: { orderId: order.id },
        })
      )?.status
    ).toBe(CouponRedemptionStatus.RESERVED);
    await payments.failSimulatedPayment(
      customer.id,
      order.id,
      "TEST_PAYMENT_DECLINED"
    );
    expect(
      await prisma.couponRedemption.findUnique({ where: { orderId: order.id } })
    ).toMatchObject({
      status: CouponRedemptionStatus.RELEASED,
      releaseReason: "TEST_PAYMENT_DECLINED",
    });
    const retryQuote = await checkout.quote(customer.id, {
      addressId: address.id,
      items: [{ productId: product.id, quantity: 1 }],
    });
    expect(retryQuote.appliedCoupon?.code).toBe(`${CODE_PREFIX}AUTO25`);
  });

  test("Deals hides automatic internal codes and reports account eligibility from real usage", async () => {
    const deals = await promotions.deals(customer.id);
    const codeCoupon = deals.coupons.find(
      (item: any) => item.name === "Ten percent test"
    );
    const autoCoupon = deals.coupons.find(
      (item: any) => item.name === "Automatic ₹25"
    );
    expect(codeCoupon).toMatchObject({
      code: `${CODE_PREFIX}SAVE10`,
      eligible: false,
      ineligibleReason: "Account usage limit reached",
    });
    expect(autoCoupon).toMatchObject({
      code: null,
      eligible: true,
      applicationMode: CouponApplicationMode.AUTO,
    });
  });
});
