import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DeliveryJobStatus, OrderStatus, PaymentStatus, Role, prisma } from '@aagam/database';
import { StoreFulfillmentService } from './store-fulfillment.service';

jest.mock('@aagam/database', () => {
  const actual = jest.requireActual('@aagam/database');
  const mockPrisma: any = {
    order: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    deliveryJob: {
      updateMany: jest.fn(),
    },
    dispatchAssignment: {
      updateMany: jest.fn(),
    },
    payment: {
      updateMany: jest.fn(),
    },
    orderStatusHistory: {
      create: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb(mockPrisma)),
  };
  return {
    ...actual,
    prisma: mockPrisma,
  };
});

describe('StoreFulfillmentService — Store Self-Delivery for Online Orders', () => {
  let service: StoreFulfillmentService;
  let mockOrderService: {
    updateStatus: jest.Mock;
    recordStatusHistory: jest.Mock;
    emitTrackingUpdate: jest.Mock;
  };

  const ownerId = 'store-owner-123';
  const otherOwnerId = 'store-owner-456';
  const storeId = 'store-789';
  const orderId = 'order-online-101';

  const mockOrder = (overrides: Record<string, any> = {}) => ({
    id: orderId,
    storeId,
    status: OrderStatus.PACKED,
    storeDelivery: false, // Originally standard online rider dispatch
    itemsSnapshot: {},
    items: [],
    store: {
      id: storeId,
      ownerId,
    },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockOrderService = {
      updateStatus: jest.fn(),
      recordStatusHistory: jest.fn(),
      emitTrackingUpdate: jest.fn().mockResolvedValue(undefined),
    };
    service = new StoreFulfillmentService(mockOrderService as any);
  });

  describe('startStoreDelivery', () => {
    it('throws NotFoundException if order does not exist', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.startStoreDelivery(orderId, ownerId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException if caller does not own the store', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder());

      await expect(service.startStoreDelivery(orderId, otherOwnerId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws BadRequestException if order is in an ineligible status (e.g. PENDING)', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(
        mockOrder({ status: OrderStatus.PENDING }),
      );

      await expect(service.startStoreDelivery(orderId, ownerId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('successfully starts store self-delivery for a standard online order in PACKED status', async () => {
      const order = mockOrder({ status: OrderStatus.PACKED, storeDelivery: false });
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(order);
      (prisma.order.update as jest.Mock).mockResolvedValue({
        ...order,
        status: OrderStatus.STORE_DELIVERING,
        storeDelivery: true,
      });

      const result = await service.startStoreDelivery(orderId, ownerId);

      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: orderId },
          data: expect.objectContaining({
            status: OrderStatus.STORE_DELIVERING,
            storeDelivery: true,
          }),
        }),
      );

      // Verifies delivery jobs and dispatch assignments are updated
      expect(prisma.deliveryJob.updateMany).toHaveBeenCalledWith({
        where: { orderId },
        data: {
          status: DeliveryJobStatus.STORE_DELIVERING,
          currentRiderId: null,
        },
      });

      expect(prisma.dispatchAssignment.updateMany).toHaveBeenCalledWith({
        where: {
          deliveryJob: { orderId },
          status: { in: ['CREATED', 'OFFERED'] },
        },
        data: {
          status: 'CANCELLED',
          rejectionReason: 'Store opted for self-delivery',
        },
      });

      expect(prisma.orderStatusHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderId,
            fromStatus: OrderStatus.PACKED,
            toStatus: OrderStatus.STORE_DELIVERING,
            actorUserId: ownerId,
            actorRole: Role.STORE_OWNER,
          }),
        }),
      );

      expect(mockOrderService.emitTrackingUpdate).toHaveBeenCalledWith(orderId);
      expect(result.status).toBe(OrderStatus.STORE_DELIVERING);
      expect(result.storeDelivery).toBe(true);
    });

    it('allows starting store self-delivery from CONFIRMED and PICKING statuses', async () => {
      const order = mockOrder({ status: OrderStatus.CONFIRMED, storeDelivery: false });
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(order);
      (prisma.order.update as jest.Mock).mockResolvedValue({
        ...order,
        status: OrderStatus.STORE_DELIVERING,
        storeDelivery: true,
      });

      const result = await service.startStoreDelivery(orderId, ownerId);
      expect(result.status).toBe(OrderStatus.STORE_DELIVERING);
    });
  });

  describe('completeStoreDelivery', () => {
    it('throws BadRequestException if order is not in STORE_DELIVERING status', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(
        mockOrder({ status: OrderStatus.PACKED }),
      );

      await expect(service.completeStoreDelivery(orderId, ownerId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('successfully completes store delivery and captures pending COD payments', async () => {
      const order = mockOrder({
        status: OrderStatus.STORE_DELIVERING,
        storeDelivery: true,
      });
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(order);
      (prisma.order.update as jest.Mock).mockResolvedValue({
        ...order,
        status: OrderStatus.STORE_DELIVERED,
      });

      const result = await service.completeStoreDelivery(orderId, ownerId);

      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: orderId },
          data: expect.objectContaining({
            status: OrderStatus.STORE_DELIVERED,
          }),
        }),
      );

      expect(prisma.deliveryJob.updateMany).toHaveBeenCalledWith({
        where: { orderId },
        data: { status: DeliveryJobStatus.DELIVERED },
      });

      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: {
          orderId,
          method: 'COD',
          status: { in: [PaymentStatus.PENDING_COD, PaymentStatus.CREATED] },
        },
        data: {
          status: PaymentStatus.CAPTURED,
        },
      });

      expect(prisma.orderStatusHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderId,
            fromStatus: OrderStatus.STORE_DELIVERING,
            toStatus: OrderStatus.STORE_DELIVERED,
            actorUserId: ownerId,
            actorRole: Role.STORE_OWNER,
          }),
        }),
      );

      expect(mockOrderService.emitTrackingUpdate).toHaveBeenCalledWith(orderId);
      expect(result.status).toBe(OrderStatus.STORE_DELIVERED);
    });
  });
});
