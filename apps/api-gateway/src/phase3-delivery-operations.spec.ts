import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  Role,
  prisma,
} from "@aagam/database";
import { DeliveryJobStatus } from "@aagam/types";
import { OutboxService } from "./notifications/outbox.service";
import { DeliveryEventService } from "./orders/delivery-event.service";
import { DeliveryJobService } from "./orders/delivery-job.service";
import {
  DeliveryFailureReason,
  ReturnDisposition,
} from "./orders/delivery-operations.dto";
import { DeliveryOperationsService } from "./orders/delivery-operations.service";
import { DeliveryWorkflowService } from "./orders/delivery-workflow.service";
import { DispatchAssignmentService } from "./orders/dispatch-assignment.service";

const PREFIX = "_test_phase3_operations_";

function services() {
  const events = new DeliveryEventService();
  const jobs = new DeliveryJobService(events);
  const workflow = new DeliveryWorkflowService(events);
  const assignments = new DispatchAssignmentService(jobs, workflow, events);
  const outbox = new OutboxService();
  const operations = new DeliveryOperationsService(workflow, outbox);
  return { jobs, workflow, assignments, operations };
}

async function entityIds() {
  const users = await prisma.user.findMany({
    where: { email: { contains: PREFIX } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  const stores = await prisma.store.findMany({
    where: { name: { contains: PREFIX } },
    select: { id: true },
  });
  const storeIds = stores.map((store) => store.id);
  const orders = await prisma.order.findMany({
    where: {
      OR: [{ customerId: { in: userIds } }, { storeId: { in: storeIds } }],
    },
    select: { id: true },
  });
  const orderIds = orders.map((order) => order.id);
  const jobs = await prisma.deliveryJob.findMany({
    where: { orderId: { in: orderIds } },
    select: { id: true },
  });
  return { userIds, storeIds, orderIds, jobIds: jobs.map((job) => job.id) };
}

async function cleanup() {
  const ids = await entityIds();
  await prisma.deliveryFailureDecision.deleteMany({
    where: { deliveryJobId: { in: ids.jobIds } },
  });
  if (ids.orderIds.length > 0) {
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM "DeliveryOperation"
      WHERE "orderId" IN (${Prisma.join(ids.orderIds)})
    `);
  }
  await prisma.notificationDeliveryAttempt.deleteMany({
    where: { recipient: { userId: { in: ids.userIds } } },
  });
  await prisma.notificationRecipient.deleteMany({
    where: { userId: { in: ids.userIds } },
  });
  await prisma.notification.deleteMany({
    where: {
      OR: [
        { orderId: { in: ids.orderIds } },
        { deliveryJobId: { in: ids.jobIds } },
      ],
    },
  });
  await prisma.outboxEvent.deleteMany({
    where: {
      OR: [
        { aggregateId: { in: ids.orderIds } },
        { aggregateId: { in: ids.jobIds } },
      ],
    },
  });
  await prisma.deliveryEvent.deleteMany({
    where: { deliveryJobId: { in: ids.jobIds } },
  });
  await prisma.dispatchAssignment.deleteMany({
    where: { deliveryJobId: { in: ids.jobIds } },
  });
  await prisma.deliveryJob.deleteMany({ where: { id: { in: ids.jobIds } } });
  await prisma.riderLocationPing.deleteMany({
    where: { orderId: { in: ids.orderIds } },
  });
  await prisma.orderStatusHistory.deleteMany({
    where: { orderId: { in: ids.orderIds } },
  });
  await prisma.refund.deleteMany({
    where: { payment: { orderId: { in: ids.orderIds } } },
  });
  await prisma.payment.deleteMany({ where: { orderId: { in: ids.orderIds } } });
  await prisma.inventoryLedger.deleteMany({
    where: {
      OR: [
        { orderId: { in: ids.orderIds } },
        { storeId: { in: ids.storeIds } },
      ],
    },
  });
  await prisma.orderItem.deleteMany({
    where: { orderId: { in: ids.orderIds } },
  });
  await prisma.order.deleteMany({ where: { id: { in: ids.orderIds } } });
  await prisma.inventory.deleteMany({
    where: { storeId: { in: ids.storeIds } },
  });
  await prisma.store.deleteMany({ where: { id: { in: ids.storeIds } } });
  await prisma.product.deleteMany({ where: { name: { contains: PREFIX } } });
  await prisma.category.deleteMany({ where: { name: { contains: PREFIX } } });
  await prisma.riderProfile.deleteMany({
    where: { userId: { in: ids.userIds } },
  });
  await prisma.user.deleteMany({ where: { id: { in: ids.userIds } } });
}

async function seed(cod = false) {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const owner = await prisma.user.create({
    data: {
      email: `${PREFIX}owner_${suffix}@test.com`,
      role: Role.STORE_OWNER,
      name: "Store Owner",
    },
  });
  const admin = await prisma.user.create({
    data: {
      email: `${PREFIX}admin_${suffix}@test.com`,
      role: Role.ADMIN,
      name: "Admin",
    },
  });
  const customer = await prisma.user.create({
    data: {
      email: `${PREFIX}customer_${suffix}@test.com`,
      role: Role.CUSTOMER,
      name: "Customer",
    },
  });
  const riderUser = await prisma.user.create({
    data: {
      email: `${PREFIX}rider_${suffix}@test.com`,
      role: Role.RIDER,
      name: "Rider",
    },
  });
  const otherRiderUser = await prisma.user.create({
    data: {
      email: `${PREFIX}other_rider_${suffix}@test.com`,
      role: Role.RIDER,
      name: "Other Rider",
    },
  });
  const rider = await prisma.riderProfile.create({
    data: {
      userId: riderUser.id,
      status: "ONLINE",
      latitude: 17.7,
      longitude: 83.3,
    },
  });
  await prisma.riderProfile.create({
    data: {
      userId: otherRiderUser.id,
      status: "ONLINE",
      latitude: 17.71,
      longitude: 83.31,
    },
  });
  const category = await prisma.category.create({
    data: { name: `${PREFIX}category_${suffix}` },
  });
  const product = await prisma.product.create({
    data: {
      name: `${PREFIX}product_${suffix}`,
      price: 100,
      pricePaise: 10000,
      categoryId: category.id,
    },
  });
  const store = await prisma.store.create({
    data: {
      name: `${PREFIX}store_${suffix}`,
      address: "Phase 3 test store",
      latitude: 17.7,
      longitude: 83.3,
      ownerId: owner.id,
    },
  });
  await prisma.inventory.create({
    data: { storeId: store.id, productId: product.id, quantity: 10 },
  });
  const order = await prisma.order.create({
    data: {
      customerId: customer.id,
      storeId: store.id,
      status: OrderStatus.PACKED,
      totalAmount: 300,
      subtotal: 300,
      grandTotal: 300,
      subtotalPaise: 30000,
      grandTotalPaise: 30000,
      packedAt: new Date(),
      deliveryLat: 17.72,
      deliveryLng: 83.32,
      addressSnapshot: {
        recipientName: "Customer",
        phoneE164: "+919999999999",
        line1: "Test address",
        city: "Visakhapatnam",
        pincode: "530001",
      },
      items: {
        create: [
          {
            productId: product.id,
            quantity: 3,
            price: 100,
            unitPricePaise: 10000,
            lineTotalPaise: 30000,
          },
        ],
      },
    },
    include: { items: true },
  });
  await prisma.payment.create({
    data: {
      orderId: order.id,
      method: cod ? PaymentMethod.COD : PaymentMethod.ONLINE,
      status: cod ? PaymentStatus.PENDING_COD : PaymentStatus.CAPTURED,
      provider: cod ? "COD" : "SIMULATED",
      amount: 300,
      amountPaise: 30000,
      currency: "INR",
    },
  });
  return {
    owner,
    admin,
    customer,
    riderUser,
    otherRiderUser,
    rider,
    product,
    store,
    order,
  };
}

async function atCustomer(cod = false) {
  const api = services();
  const data = await seed(cod);
  const job = await api.jobs.createForPackedOrder(data.order.id, {
    id: data.admin.id,
    role: Role.ADMIN,
  });
  const offer = await api.assignments.offer(job.id, data.riderUser.id, {
    id: data.admin.id,
    role: Role.ADMIN,
  });
  await api.assignments.accept(offer.id, data.riderUser.id);
  const riderActor = { id: data.riderUser.id, role: Role.RIDER };
  const storeActor = { id: data.owner.id, role: Role.STORE_OWNER };
  await api.workflow.transition(
    job.id,
    DeliveryJobStatus.RIDER_EN_ROUTE_TO_STORE,
    riderActor
  );
  await api.workflow.transition(
    job.id,
    DeliveryJobStatus.RIDER_AT_STORE,
    riderActor
  );
  await api.workflow.transition(
    job.id,
    DeliveryJobStatus.PICKUP_VERIFIED,
    storeActor
  );
  await api.workflow.transition(
    job.id,
    DeliveryJobStatus.OUT_FOR_DELIVERY,
    riderActor
  );
  await api.workflow.transition(
    job.id,
    DeliveryJobStatus.RIDER_AT_CUSTOMER,
    riderActor
  );
  return {
    api,
    data,
    job,
    riderActor,
    storeActor,
    customerActor: { id: data.customer.id, role: Role.CUSTOMER },
  };
}

describe("Phase 3 delivery exceptions, COD, returns, and OTP", () => {
  const originalOtpRequired = process.env.DELIVERY_OTP_REQUIRED;
  const originalCodRequired = process.env.COD_COLLECTION_REQUIRED;
  const originalOtpSecret = process.env.DELIVERY_OTP_SECRET;

  beforeEach(async () => {
    process.env.DELIVERY_OTP_REQUIRED = "false";
    process.env.COD_COLLECTION_REQUIRED = "false";
    process.env.DELIVERY_OTP_SECRET = "phase3-test-secret";
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    process.env.DELIVERY_OTP_REQUIRED = originalOtpRequired;
    process.env.COD_COLLECTION_REQUIRED = originalCodRequired;
    process.env.DELIVERY_OTP_SECRET = originalOtpSecret;
    await prisma.$disconnect();
  });

  it("stores only an OTP hash and completes delivery after customer-scoped verification", async () => {
    process.env.DELIVERY_OTP_REQUIRED = "true";
    const { api, data, job, riderActor, customerActor } = await atCustomer(
      false
    );

    const issued = await api.operations.issueOtp(
      job.id,
      riderActor,
      "test-otp-issue"
    );
    const repeated = await api.operations.issueOtp(
      job.id,
      riderActor,
      "test-otp-issue"
    );
    expect(repeated.operationId).toBe(issued.operationId);

    const rows = await prisma.$queryRaw<Array<{ details: any }>>(Prisma.sql`
      SELECT "details" FROM "DeliveryOperation" WHERE "id" = ${issued.operationId}
    `);
    expect(rows[0].details.codeHash).toBeTruthy();
    expect(rows[0].details.salt).toBeTruthy();
    expect(rows[0].details.nonce).toBeTruthy();
    expect(rows[0].details.code).toBeUndefined();

    await expect(
      api.operations.getCustomerOtp(job.id, riderActor)
    ).rejects.toThrow("order customer");
    const customerOtp = await api.operations.getCustomerOtp(
      job.id,
      customerActor
    );
    expect(customerOtp.code).toMatch(/^\d{6}$/);

    await expect(
      api.operations.completeDelivery(job.id, riderActor, {
        otpCode: "000000",
        riderConfirmed: true,
      })
    ).rejects.toThrow("incorrect");
    expect(
      (await prisma.deliveryJob.findUnique({ where: { id: job.id } }))?.status
    ).toBe(DeliveryJobStatus.RIDER_AT_CUSTOMER);

    const delivered = await api.operations.completeDelivery(
      job.id,
      riderActor,
      {
        otpCode: customerOtp.code,
        proofType: "CUSTOMER_OTP_PIN",
        riderConfirmed: true,
      },
      "complete-with-otp"
    );
    expect(delivered.status).toBe(DeliveryJobStatus.DELIVERED);
    expect(
      (await prisma.order.findUnique({ where: { id: data.order.id } }))?.status
    ).toBe(OrderStatus.DELIVERED);
  });

  it("limits incorrect OTP attempts without changing delivery state", async () => {
    process.env.DELIVERY_OTP_REQUIRED = "true";
    const { api, job, riderActor } = await atCustomer(false);
    await api.operations.issueOtp(job.id, riderActor, "attempt-limit-otp");

    for (let attempt = 1; attempt < 5; attempt += 1) {
      await expect(
        api.operations.completeDelivery(job.id, riderActor, {
          otpCode: "999999",
          riderConfirmed: true,
        })
      ).rejects.toThrow("incorrect");
    }
    await expect(
      api.operations.completeDelivery(job.id, riderActor, {
        otpCode: "999999",
        riderConfirmed: true,
      })
    ).rejects.toMatchObject({ status: 429 });
    expect(
      (await prisma.deliveryJob.findUnique({ where: { id: job.id } }))?.status
    ).toBe(DeliveryJobStatus.RIDER_AT_CUSTOMER);
  });

  it("requires exact COD collection before delivery and makes collection idempotent", async () => {
    process.env.COD_COLLECTION_REQUIRED = "true";
    const { api, job, riderActor, customerActor } = await atCustomer(true);

    await api.operations.issueOtp(job.id, riderActor, "cod-delivery-otp");
    const customerOtp = await api.operations.getCustomerOtp(
      job.id,
      customerActor
    );

    await expect(
      api.operations.completeDelivery(job.id, riderActor, {
        otpCode: customerOtp.code,
        riderConfirmed: true,
      })
    ).rejects.toThrow("Collect the full COD amount");
    await expect(
      api.operations.collectCod(job.id, riderActor, { amountPaise: 29999 })
    ).rejects.toThrow("must equal 30000");

    const first = await api.operations.collectCod(
      job.id,
      riderActor,
      { amountPaise: 30000, collectionReference: "cash-received" },
      "cod-collect-once"
    );
    const duplicate = await api.operations.collectCod(
      job.id,
      riderActor,
      { amountPaise: 30000, collectionReference: "cash-received" },
      "cod-collect-once"
    );
    expect(duplicate.id).toBe(first.id);
    expect(
      (await prisma.payment.findUnique({ where: { orderId: job.orderId } }))
        ?.status
    ).toBe(PaymentStatus.CAPTURED);
    expect(
      (
        await api.operations.completeDelivery(job.id, riderActor, {
          otpCode: customerOtp.code,
          riderConfirmed: true,
        })
      ).status
    ).toBe(DeliveryJobStatus.DELIVERED);
  });

  it("records a failure and enforces the return-to-store lifecycle", async () => {
    const { api, data, job, riderActor, storeActor } = await atCustomer(false);
    await expect(
      api.operations.recordFailure(
        job.id,
        { id: data.otherRiderUser.id, role: Role.RIDER },
        { reason: DeliveryFailureReason.CUSTOMER_REFUSED }
      )
    ).rejects.toThrow("assigned rider");

    const failed = await api.operations.recordFailure(
      job.id,
      riderActor,
      {
        reason: DeliveryFailureReason.CUSTOMER_REFUSED,
        note: "Customer refused the parcel",
      },
      "failure-once"
    );
    expect(failed.job.status).toBe(DeliveryJobStatus.DELIVERY_FAILED);
    expect(
      (
        await api.operations.startReturn(
          job.id,
          riderActor,
          "return-start-once"
        )
      ).job.status
    ).toBe(DeliveryJobStatus.RETURNING_TO_STORE);
    await expect(
      api.operations.confirmReturn(
        job.id,
        riderActor,
        "return-confirm-wrong-role"
      )
    ).rejects.toThrow("owning store");
    expect(
      (
        await api.operations.confirmReturn(
          job.id,
          storeActor,
          "return-confirm-once"
        )
      ).job.status
    ).toBe(DeliveryJobStatus.RETURNED_TO_STORE);
    expect(
      (await prisma.riderProfile.findUnique({ where: { id: data.rider.id } }))
        ?.status
    ).toBe("ONLINE");
  });

  it("restores only sellable returned stock and prevents duplicate inspection", async () => {
    const { api, data, job, riderActor, storeActor } = await atCustomer(false);
    await api.operations.recordFailure(
      job.id,
      riderActor,
      {
        reason: DeliveryFailureReason.CUSTOMER_REFUSED,
      },
      "inspection-failure"
    );
    await api.operations.startReturn(
      job.id,
      riderActor,
      "inspection-return-start"
    );
    await api.operations.confirmReturn(
      job.id,
      storeActor,
      "inspection-return-confirm"
    );

    const input = {
      lines: [
        {
          orderItemId: data.order.items[0].id,
          disposition: ReturnDisposition.SELLABLE,
          quantity: 2,
        },
        {
          orderItemId: data.order.items[0].id,
          disposition: ReturnDisposition.DAMAGED,
          quantity: 1,
        },
      ],
      note: "Two units sealed, one damaged",
    };
    const operation = await api.operations.inspectReturn(
      job.id,
      storeActor,
      input,
      "inspection-once"
    );
    const duplicate = await api.operations.inspectReturn(
      job.id,
      storeActor,
      input,
      "inspection-once"
    );
    expect(duplicate.id).toBe(operation.id);
    await expect(
      api.operations.inspectReturn(
        job.id,
        storeActor,
        input,
        "inspection-second-key"
      )
    ).rejects.toThrow("already completed");

    const inventory = await prisma.inventory.findUnique({
      where: {
        storeId_productId: {
          storeId: data.store.id,
          productId: data.product.id,
        },
      },
    });
    expect(inventory?.quantity).toBe(12);
    const ledger = await prisma.inventoryLedger.findMany({
      where: { orderId: data.order.id, reason: "ORDER_CANCEL_RESTORE" },
    });
    expect(ledger).toHaveLength(1);
    expect(ledger[0].quantityDelta).toBe(2);
  });

  it("records exact COD settlement once for the owning store", async () => {
    const { api, data, job, riderActor, storeActor } = await atCustomer(true);
    await api.operations.collectCod(
      job.id,
      riderActor,
      { amountPaise: 30000 },
      "settlement-collection"
    );
    await expect(
      api.operations.settleCod(
        job.id,
        { id: data.customer.id, role: Role.CUSTOMER },
        { amountPaise: 30000, settlementReference: "SET-001" }
      )
    ).rejects.toThrow("owning store");

    const settled = await api.operations.settleCod(
      job.id,
      storeActor,
      { amountPaise: 30000, settlementReference: "SET-001" },
      "settlement-once"
    );
    const duplicate = await api.operations.settleCod(
      job.id,
      storeActor,
      { amountPaise: 30000, settlementReference: "SET-001" },
      "settlement-once"
    );
    expect(duplicate.id).toBe(settled.id);
    await expect(
      api.operations.settleCod(
        job.id,
        storeActor,
        { amountPaise: 30000, settlementReference: "SET-002" },
        "settlement-second"
      )
    ).rejects.toThrow("COD ledger is already finalized");
  });

  it("restricts the queue and creates custom outbox audit events", async () => {
    const { api, data, job, riderActor, storeActor } = await atCustomer(false);
    await api.operations.recordFailure(
      job.id,
      riderActor,
      {
        reason: DeliveryFailureReason.ADDRESS_NOT_FOUND,
      },
      "queue-failure"
    );

    await expect(
      api.operations.getQueue({ id: data.customer.id, role: Role.CUSTOMER })
    ).rejects.toThrow("admin and store owners");
    const storeQueue = await api.operations.getQueue(storeActor);
    expect(storeQueue.map((item) => item.id)).toContain(job.id);
    const event = await prisma.outboxEvent.findFirst({
      where: {
        aggregateId: job.id,
        idempotencyKey: { contains: "delivery-operation:" },
      },
      orderBy: { createdAt: "desc" },
    });
    expect((event?.payload as any)?.title).toContain(
      "Delivery attempt unsuccessful"
    );
    expect((event?.payload as any)?.metadata?.operationType).toBe(
      "DELIVERY_FAILURE_RECORDED"
    );
  });
});
