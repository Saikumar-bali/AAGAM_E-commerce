import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { OrderStatus, Role, prisma } from '@aagam/database';

type Actor = { id: string; role: Role };

type DateRange = { from: Date; to: Date; days: number };

function resolveDateRange(daysInput?: string | number): DateRange {
  const days = Number(daysInput ?? 30);
  if (!Number.isInteger(days) || days < 1 || days > 180) {
    throw new BadRequestException('days must be an integer from 1 to 180');
  }
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from, to, days };
}

function safeNumber(value: unknown) {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
}

@Injectable()
export class AnalyticsService {
  async businessDashboard(actor: Actor, daysInput?: string | number) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException('Only admin can view analytics');
    const range = resolveDateRange(daysInput);
    const where = { createdAt: { gte: range.from, lte: range.to } };

    const [orders, users, stores, riders, supportRows, ratingRows] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          store: { select: { id: true, name: true } },
          rider: { include: { user: { select: { id: true, name: true, email: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where: { createdAt: { gte: range.from, lte: range.to } } }),
      prisma.store.count({ where: { isActive: true, deletedAt: null } }),
      prisma.riderProfile.count(),
      prisma.orderStatusHistory.findMany({ where: { note: 'Customer opened support ticket.', createdAt: { gte: range.from, lte: range.to } }, orderBy: { createdAt: 'desc' } }),
      prisma.orderStatusHistory.findMany({ where: { note: 'Customer submitted delivery rating.', createdAt: { gte: range.from, lte: range.to } } }),
    ]);

    const statusCounts = Object.values(OrderStatus).reduce<Record<string, number>>((acc, status) => ({ ...acc, [status]: 0 }), {});
    for (const order of orders) statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;

    const delivered = orders.filter((order) => order.status === OrderStatus.DELIVERED);
    const cancelled = orders.filter((order) => order.status === OrderStatus.CANCELLED);
    const inactiveStatuses: OrderStatus[] = [OrderStatus.DELIVERED, OrderStatus.CANCELLED, OrderStatus.PAYMENT_FAILED];
    const active = orders.filter((order) => !inactiveStatuses.includes(order.status as OrderStatus));
    const revenuePaise = delivered.reduce((sum, order) => sum + safeNumber(order.grandTotalPaise), 0);
    const revenue = delivered.reduce((sum, order) => sum + safeNumber(order.grandTotal), 0);
    const averageOrderValuePaise = delivered.length ? Math.round(revenuePaise / delivered.length) : 0;

    const storePerformance = Array.from(orders.reduce((map, order) => {
      const key = order.storeId;
      const row = map.get(key) || { storeId: key, storeName: order.store?.name || 'Store', orders: 0, delivered: 0, cancelled: 0, revenuePaise: 0, revenue: 0 };
      row.orders += 1;
      if (order.status === OrderStatus.DELIVERED) {
        row.delivered += 1;
        row.revenuePaise += safeNumber(order.grandTotalPaise);
        row.revenue += safeNumber(order.grandTotal);
      }
      if (order.status === OrderStatus.CANCELLED) row.cancelled += 1;
      map.set(key, row);
      return map;
    }, new Map<string, any>()).values()).sort((a, b) => b.revenuePaise - a.revenuePaise).slice(0, 10);

    const activeRiderStatuses: OrderStatus[] = [OrderStatus.RIDER_ASSIGNED, OrderStatus.OUT_FOR_DELIVERY];
    const riderPerformance = Array.from(orders.filter((order) => order.riderId).reduce((map, order) => {
      const key = order.riderId as string;
      const row = map.get(key) || { riderProfileId: key, riderName: order.rider?.user?.name || order.rider?.user?.email || 'Rider', assigned: 0, delivered: 0, active: 0 };
      row.assigned += 1;
      if (order.status === OrderStatus.DELIVERED) row.delivered += 1;
      if (activeRiderStatuses.includes(order.status as OrderStatus)) row.active += 1;
      map.set(key, row);
      return map;
    }, new Map<string, any>()).values()).sort((a, b) => b.delivered - a.delivered).slice(0, 10);

    const supportByCategory = supportRows.reduce<Record<string, number>>((acc, row) => {
      const category = (row.metadata as any)?.category || 'OTHER';
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});

    const ratingValues = ratingRows.map((row) => safeNumber((row.metadata as any)?.orderRating)).filter((value) => value > 0);
    const averageRating = ratingValues.length ? Number((ratingValues.reduce((sum, value) => sum + value, 0) / ratingValues.length).toFixed(2)) : null;

    const last7Days = Array.from({ length: Math.min(7, range.days) }, (_, index) => {
      const day = new Date(range.to.getTime() - (Math.min(7, range.days) - index - 1) * 24 * 60 * 60 * 1000);
      const key = day.toISOString().slice(0, 10);
      const dayOrders = orders.filter((order) => order.createdAt.toISOString().slice(0, 10) === key);
      return {
        date: key,
        orders: dayOrders.length,
        delivered: dayOrders.filter((order) => order.status === OrderStatus.DELIVERED).length,
        revenuePaise: dayOrders.filter((order) => order.status === OrderStatus.DELIVERED).reduce((sum, order) => sum + safeNumber(order.grandTotalPaise), 0),
      };
    });

    return {
      range: { days: range.days, from: range.from.toISOString(), to: range.to.toISOString() },
      summary: {
        totalOrders: orders.length,
        activeOrders: active.length,
        deliveredOrders: delivered.length,
        cancelledOrders: cancelled.length,
        revenue,
        revenuePaise,
        averageOrderValuePaise,
        newUsers: users,
        activeStores: stores,
        riders,
        supportTickets: supportRows.length,
        averageRating,
      },
      statusCounts,
      storePerformance,
      riderPerformance,
      support: {
        total: supportRows.length,
        byCategory: supportByCategory,
        recent: supportRows.slice(0, 10).map((row) => ({ id: row.id, orderId: row.orderId, createdAt: row.createdAt, metadata: row.metadata })),
      },
      ratings: { count: ratingValues.length, average: averageRating },
      trend: last7Days,
    };
  }
}
