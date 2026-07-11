import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { prisma, Role } from '@aagam/database';

const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = isProduction
  ? process.env.CORS_ORIGINS?.split(',') || []
  : [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3005',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:3005',
    ];

interface AuthenticatedSocket extends Socket {
  data: {
    user?: {
      id: string;
      email: string;
      role: Role;
      name: string | null;
    };
  };
}

const TRACKABLE_STATUSES = ['RIDER_ASSIGNED', 'OUT_FOR_DELIVERY'];
const LEGACY_RIDER_QUEUE_ERROR = {
  ok: false,
  code: 'RIDER_PUBLIC_QUEUE_REMOVED',
  message: 'Public rider queues are disabled. Riders receive only addressed dispatch assignment offers.',
};

@WebSocketGateway({
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
})
export class TrackingGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '') ||
        (client.handshake.headers?.cookie as string)
          ?.split('; ')
          .find((c) => c.startsWith('access_token='))
          ?.split('=')[1];

      if (!token) {
        console.log('[Socket] Connection rejected: no token');
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, role: true, name: true },
      });

      if (!user) {
        console.log('[Socket] Connection rejected: user not found');
        client.disconnect();
        return;
      }

      client.data.user = user;
      console.log(`[Socket] Authenticated: ${user.email} (${user.role})`);
    } catch (err) {
      console.log('[Socket] Connection rejected: invalid token');
      client.disconnect();
    }
  }

  emitOrderStatusUpdated(orderId: string, payload: any) {
    this.server?.to(`order_${orderId}`).emit('orderStatusUpdated', payload);
    this.server?.to('admin_orders').emit('orderStatusUpdated', payload);
    this.server?.to('admin_monitor').emit('orderStatusUpdated', payload);
  }

  emitOrderTimelineUpdated(orderId: string, payload: any) {
    this.server?.to(`order_${orderId}`).emit('orderTimelineUpdated', payload);
    this.server?.to('admin_monitor').emit('orderTimelineUpdated', payload);
  }

  emitRiderAssigned(orderId: string, payload: any) {
    this.server?.to(`order_${orderId}`).emit('riderAssigned', payload);
    this.server?.to('admin_monitor').emit('riderAssigned', payload);
  }

  emitRiderLocationUpdated(orderId: string, payload: any) {
    this.server?.to(`order_${orderId}`).volatile.emit('riderLocationUpdated', payload);
    this.server?.to(`order_${orderId}`).volatile.emit('riderMoved', payload);
    this.server?.to('admin_monitor').volatile.emit('riderLocationUpdated', payload);
    this.server?.to('admin_monitor').volatile.emit('adminRiderUpdate', payload);
  }

  emitTrackingStopped(orderId: string, payload: any) {
    this.server?.to(`order_${orderId}`).emit('trackingStopped', payload);
    this.server?.to('admin_monitor').emit('trackingStopped', payload);
  }

  @SubscribeMessage('joinOrder')
  async handleJoinOrder(
    @MessageBody() data: { orderId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const user = client.data.user;
    if (!user) {
      console.log('[Socket] joinOrder rejected: unauthenticated');
      return;
    }

    const order = await prisma.order.findUnique({
      where: { id: data.orderId },
      select: { id: true, customerId: true, riderId: true, store: { select: { ownerId: true } } },
    });

    if (!order) {
      console.log(`[Socket] joinOrder rejected: order ${data.orderId} not found`);
      return;
    }

    if (user.role === Role.CUSTOMER && order.customerId !== user.id) {
      console.log(`[Socket] joinOrder rejected: customer ${user.id} cannot join order ${data.orderId}`);
      return;
    }

    if (user.role === Role.RIDER) {
      const riderProfile = await prisma.riderProfile.findUnique({ where: { userId: user.id } });
      if (!riderProfile || order.riderId !== riderProfile.id) {
        console.log(`[Socket] joinOrder rejected: rider ${user.id} not assigned to order ${data.orderId}`);
        return;
      }
    }

    if (user.role === Role.STORE_OWNER && order.store.ownerId !== user.id) {
      console.log(`[Socket] joinOrder rejected: store owner ${user.id} does not own order ${data.orderId}`);
      return;
    }

    client.join(`order_${data.orderId}`);
    console.log(`[Socket] ${user.email} joined room: order_${data.orderId}`);
  }

  @SubscribeMessage('joinAdminMonitor')
  handleJoinAdminMonitor(@ConnectedSocket() client: AuthenticatedSocket) {
    const user = client.data.user;
    if (!user || user.role !== Role.ADMIN) {
      console.log('[Socket] joinAdminMonitor rejected: not admin');
      return;
    }
    client.join('admin_monitor');
    console.log('[Socket] Admin joined global monitor room');
  }

  @SubscribeMessage('joinAdminOrders')
  handleJoinAdminOrders(@ConnectedSocket() client: AuthenticatedSocket) {
    const user = client.data.user;
    if (!user || user.role !== Role.ADMIN) {
      console.log('[Socket] joinAdminOrders rejected: not admin');
      return;
    }
    client.join('admin_orders');
    console.log('[Socket] Admin joined admin_orders room');
  }

  @SubscribeMessage('updateRiderLocation')
  async handleRiderLocationUpdate(
    @MessageBody()
    data: {
      riderId: string;
      orderId?: string;
      latitude: number;
      longitude: number;
      bearing: number;
      status: string;
    },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const user = client.data.user;
    if (!user || user.role !== Role.RIDER) {
      console.log('[Socket] updateRiderLocation rejected: not a rider');
      return;
    }

    const riderProfile = await prisma.riderProfile.findUnique({ where: { userId: user.id } });
    if (!riderProfile) {
      console.log(`[Socket] updateRiderLocation rejected: no rider profile for ${user.id}`);
      return;
    }

    if (data.orderId) {
      const order = await prisma.order.findUnique({ where: { id: data.orderId } });
      if (!order) {
        console.log(`[Socket] updateRiderLocation rejected: order ${data.orderId} not found`);
        return;
      }
      if (order.riderId !== riderProfile.id) {
        console.log(`[Socket] updateRiderLocation rejected: rider ${user.id} not assigned to order ${data.orderId}`);
        return;
      }
      if (!TRACKABLE_STATUSES.includes(order.status)) {
        console.log(`[Socket] updateRiderLocation rejected: order ${data.orderId} status ${order.status} not trackable`);
        return;
      }
    }

    const payload = {
      ...data,
      riderId: riderProfile.id,
      timestamp: new Date().toISOString(),
    };

    if (data.orderId) {
      this.server.to(`order_${data.orderId}`).volatile.emit('riderMoved', payload);
    }
    this.server.to('admin_monitor').volatile.emit('adminRiderUpdate', payload);
  }

  @SubscribeMessage('joinRiderZone')
  handleJoinRiderZone(@ConnectedSocket() client: AuthenticatedSocket) {
    console.log(`[Socket] joinRiderZone rejected for ${client.data.user?.id || 'unknown'}: public queue removed`);
    return LEGACY_RIDER_QUEUE_ERROR;
  }

  @SubscribeMessage('joinRidersQueue')
  handleJoinRidersQueue(@ConnectedSocket() client: AuthenticatedSocket) {
    console.log(`[Socket] joinRidersQueue rejected for ${client.data.user?.id || 'unknown'}: public queue removed`);
    return LEGACY_RIDER_QUEUE_ERROR;
  }
}
