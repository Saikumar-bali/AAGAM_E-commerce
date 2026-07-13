import { Injectable } from '@nestjs/common';
import { prisma, Prisma, Role } from '@aagam/database';
import { NotificationEventTypeType } from '@aagam/types';

export type RoutedRecipient = {
  userId: string;
  role: Role;
  deepLink: string;
};

export type RoutedNotification = {
  title: string;
  body: string;
  orderId: string | null;
  deliveryJobId: string | null;
  data: Prisma.InputJsonValue;
  recipients: RoutedRecipient[];
};

@Injectable()
export class NotificationRoutingService {
  private deepLink(role: Role, orderId?: string | null) {
    if (role === Role.ADMIN) return orderId ? `/admin/orders/${orderId}` : '/admin/notifications';
    if (role === Role.STORE_OWNER) return '/store/orders';
    if (role === Role.RIDER) return orderId ? `/rider/delivery?order=${encodeURIComponent(orderId)}` : '/rider/notifications';
    return orderId ? `/shop/orders/${orderId}` : '/shop/notifications';
  }

  private async adminRecipients() {
    return prisma.user.findMany({
      where: { role: Role.ADMIN },
      select: { id: true, role: true },
    });
  }

  async route(outboxEvent: any): Promise<RoutedNotification> {
    const payload = (outboxEvent.payload || {}) as any;
    const eventType = outboxEvent.eventType as NotificationEventTypeType;

    let deliveryJobId: string | null = payload.deliveryJobId || null;
    if (!deliveryJobId && outboxEvent.aggregateType === 'DELIVERY_JOB') {
      deliveryJobId = outboxEvent.aggregateId;
    }

    let assignment: any = null;
    if (payload.assignmentId) {
      assignment = await prisma.dispatchAssignment.findUnique({
        where: { id: payload.assignmentId },
        include: { riderProfile: { include: { user: true } }, deliveryJob: true },
      });
      deliveryJobId = deliveryJobId || assignment?.deliveryJobId || null;
    }

    let orderId: string | null = payload.orderId || null;
    if (!orderId && outboxEvent.aggregateType === 'ORDER') orderId = outboxEvent.aggregateId;
    if (!orderId && deliveryJobId) {
      const job = await prisma.deliveryJob.findUnique({
        where: { id: deliveryJobId },
        select: { orderId: true },
      });
      orderId = job?.orderId || null;
    }

    const order = orderId
      ? await prisma.order.findUnique({
          where: { id: orderId },
          include: {
            customer: { select: { id: true, role: true, name: true } },
            store: { include: { owner: { select: { id: true, role: true, name: true } } } },
            rider: { include: { user: { select: { id: true, role: true, name: true } } } },
            payment: { select: { method: true } },
          },
        })
      : null;

    const admins = await this.adminRecipients();
    const candidateMap = new Map<string, { id: string; role: Role }>();
    const add = (user?: { id: string; role: Role } | null) => {
      if (user?.id) candidateMap.set(user.id, user);
    };
    const addAdmins = () => admins.forEach(add);
    const addCustomer = () => add(order?.customer || null);
    const addStore = () => add(order?.store?.owner || null);
    const addRider = () => add(order?.rider?.user || assignment?.riderProfile?.user || null);

    switch (eventType) {
      case 'ORDER_PLACED':
        addStore();
        addAdmins();
        break;
      case 'STORE_ACCEPTED_ORDER':
      case 'STORE_STARTED_PICKING':
        addCustomer();
        break;
      case 'ORDER_PACKED':
      case 'DISPATCH_JOB_CREATED':
        addAdmins();
        break;
      case 'ASSIGNMENT_OFFERED': {
        if (payload.riderUserId) {
          const rider = await prisma.user.findFirst({
            where: { id: payload.riderUserId, role: Role.RIDER },
            select: { id: true, role: true },
          });
          add(rider);
        } else {
          addRider();
        }
        break;
      }
      case 'ASSIGNMENT_ACCEPTED':
        addCustomer();
        addStore();
        addAdmins();
        break;
      case 'ASSIGNMENT_REJECTED':
      case 'ASSIGNMENT_EXPIRED':
        addStore();
        addAdmins();
        break;
      case 'RIDER_EN_ROUTE_TO_STORE':
        addStore();
        addAdmins();
        break;
      case 'RIDER_AT_STORE':
        addStore();
        break;
      case 'PICKUP_VERIFIED':
        addCustomer();
        addAdmins();
        break;
      case 'OUT_FOR_DELIVERY':
      case 'RIDER_AT_CUSTOMER':
        addCustomer();
        break;
      case 'DELIVERY_COMPLETED':
        addCustomer();
        addStore();
        addRider();
        addAdmins();
        break;
      case 'DELIVERY_FAILED':
      case 'DELIVERY_CANCELLED':
        addCustomer();
        addStore();
        addAdmins();
        break;
      case 'ADMIN_BROADCAST': {
        const audience = payload.audience || 'ALL_USERS';
        const roleByAudience: Record<string, Role | null> = {
          ALL_USERS: null,
          CUSTOMERS: Role.CUSTOMER,
          RIDERS: Role.RIDER,
          STORE_OWNERS: Role.STORE_OWNER,
          ADMINS: Role.ADMIN,
        };
        const users = await prisma.user.findMany({
          where: roleByAudience[audience] ? { role: roleByAudience[audience] as Role } : {},
          select: { id: true, role: true },
          take: 5000,
        });
        users.forEach(add);
        break;
      }
    }

    const shortOrder = orderId ? `#${orderId.slice(-8).toUpperCase()}` : 'Order';
    const storeName = order?.store?.name || 'the store';
    const template = this.template(eventType, {
      shortOrder,
      storeName,
      paymentMethod: order?.payment?.method,
      title: payload.title,
      body: payload.body,
    });

    const recipients = Array.from(candidateMap.values()).map((user) => ({
      userId: user.id,
      role: user.role,
      deepLink: payload.deepLink || this.deepLink(user.role, orderId),
    }));

    return {
      title: template.title,
      body: template.body,
      orderId,
      deliveryJobId,
      data: {
        eventType,
        orderId,
        deliveryJobId,
        assignmentId: payload.assignmentId || null,
        ...(payload.metadata || {}),
      },
      recipients,
    };
  }

  private template(
    eventType: NotificationEventTypeType,
    context: { shortOrder: string; storeName: string; paymentMethod?: string; title?: string; body?: string },
  ) {
    if (eventType === 'ADMIN_BROADCAST') {
      return { title: context.title || 'AAGAM update', body: context.body || 'There is a new service update.' };
    }
    const templates: Record<NotificationEventTypeType, { title: string; body: string }> = {
      ORDER_PLACED: { title: 'New order received', body: `${context.shortOrder} was placed for ${context.storeName}.` },
      STORE_ACCEPTED_ORDER: { title: 'Order accepted', body: `${context.storeName} accepted ${context.shortOrder}.` },
      STORE_STARTED_PICKING: { title: 'Preparing your order', body: `${context.storeName} started picking ${context.shortOrder}.` },
      ORDER_PACKED: { title: 'Order ready for dispatch', body: `${context.shortOrder} is packed and waiting for a rider.` },
      DISPATCH_JOB_CREATED: { title: 'Dispatch job created', body: `${context.shortOrder} is ready for rider assignment.` },
      ASSIGNMENT_OFFERED: { title: 'New delivery offer', body: `A delivery from ${context.storeName} is waiting for your response.` },
      ASSIGNMENT_ACCEPTED: { title: 'Rider assigned', body: `A rider accepted ${context.shortOrder}.` },
      ASSIGNMENT_REJECTED: { title: 'Rider declined offer', body: `${context.shortOrder} needs another rider.` },
      ASSIGNMENT_EXPIRED: { title: 'Rider offer expired', body: `${context.shortOrder} returned to the dispatch queue.` },
      RIDER_EN_ROUTE_TO_STORE: { title: 'Rider heading to store', body: `The rider started travelling to ${context.storeName}.` },
      RIDER_AT_STORE: { title: 'Rider arrived at store', body: `The rider is ready to collect ${context.shortOrder}.` },
      PICKUP_VERIFIED: { title: 'Pickup verified', body: `${context.shortOrder} was handed to the rider.` },
      OUT_FOR_DELIVERY: { title: 'Out for delivery', body: `${context.shortOrder} is on the way.` },
      RIDER_AT_CUSTOMER: { title: 'Rider has arrived', body: `The rider reached the delivery location for ${context.shortOrder}.` },
      DELIVERY_COMPLETED: { title: 'Delivery completed', body: `${context.shortOrder} was delivered successfully.` },
      DELIVERY_FAILED: { title: 'Delivery needs attention', body: `The delivery attempt for ${context.shortOrder} failed.` },
      DELIVERY_CANCELLED: { title: 'Delivery cancelled', body: `${context.shortOrder} was cancelled.` },
      ADMIN_BROADCAST: { title: context.title || 'AAGAM update', body: context.body || 'There is a new service update.' },
    };
    return templates[eventType];
  }
}
