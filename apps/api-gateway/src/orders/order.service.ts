/**
 * Order service facade.
 *
 * Split out of the former order.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { Injectable } from '@nestjs/common';
import { OrderStatus, Role } from '@aagam/database';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { RefundsService } from '../payments/refunds.service';
import { OrderServiceBase } from './order.service.base';
import { OrderStatusService } from './order.status.service';
import { OrderCancellationService } from './order.cancellation.service';
import { OrderRiderService } from './order.rider.service';
import { OrderQueryService } from './order.query.service';

@Injectable()
export class OrderService extends OrderServiceBase {
  private readonly status: OrderStatusService;
  private readonly cancellation: OrderCancellationService;
  private readonly rider: OrderRiderService;
  private readonly query: OrderQueryService;

  constructor(
    trackingGateway: TrackingGateway,
    refundsService: RefundsService,
  ) {
    super();
    this.useDeps({ trackingGateway, refundsService });
    this.status = new OrderStatusService();
    this.cancellation = new OrderCancellationService();
    this.rider = new OrderRiderService();
    this.query = new OrderQueryService();
    this.status.useDeps({ trackingGateway, refundsService });
    this.cancellation.useDeps({ trackingGateway, refundsService });
    this.rider.useDeps({ trackingGateway, refundsService });
    this.query.useDeps({ trackingGateway, refundsService });
  }

  async updateStatus(
    id: string,
    nextStatus: OrderStatus,
    actor: { id: string; role: Role },
    riderId?: string,
  ) {
    return this.status.updateStatus(id, nextStatus, actor, riderId);
  }

  async cancelMyOrder(userId: string, orderId: string) {
    return this.cancellation.cancelMyOrder(userId, orderId);
  }

  async forceCancel(orderId: string, actor: { id: string; role: Role }, reason?: string) {
    return this.cancellation.forceCancel(orderId, actor, reason);
  }

  async assignRider(orderId: string, userId: string) {
    return this.rider.assignRider(orderId, userId);
  }

  async reassignRider(orderId: string, newUserId: string, actor: { id: string; role: Role }) {
    return this.rider.reassignRider(orderId, newUserId, actor);
  }

  async findAll() {
    return this.query.findAll();
  }

  async findOne(id: string, actor?: { id: string; role: Role }) {
    return this.query.findOne(id, actor);
  }

  async findMyOrder(userId: string, id: string) {
    return this.query.findMyOrder(userId, id);
  }

  async findStoreOrders(ownerId: string) {
    return this.query.findStoreOrders(ownerId);
  }

  async findMyOrders(userId: string) {
    return this.query.findMyOrders(userId);
  }

  async findByRiderId(riderId: string) {
    return this.query.findByRiderId(riderId);
  }

  async findRecentForRiders(since: Date) {
    return this.query.findRecentForRiders(since);
  }

  async findOneWithDetails(id: string) {
    return this.query.findOneWithDetails(id);
  }
}
