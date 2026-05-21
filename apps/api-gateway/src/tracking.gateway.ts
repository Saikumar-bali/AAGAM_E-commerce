import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = isProduction 
  ? process.env.CORS_ORIGINS?.split(',') || []
  : [
      'http://localhost:3000', 
      'http://localhost:3001', 
      'http://localhost:3005',
      'http://127.0.0.1:3000', 
      'http://127.0.0.1:3001',
      'http://127.0.0.1:3005'
    ];

@WebSocketGateway({
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
})
export class TrackingGateway {
  @WebSocketServer()
  server!: Server;

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

  // 1. Client (Admin/Customer) joins a room for a specific order
  @SubscribeMessage('joinOrder')
  handleJoinOrder(
    @MessageBody() data: { orderId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`order_${data.orderId}`);
    console.log(`Client joined room: order_${data.orderId}`);
  }

  // 2. Admin joins a global monitoring room for all active riders
  @SubscribeMessage('joinAdminMonitor')
  handleJoinAdminMonitor(@ConnectedSocket() client: Socket) {
    client.join('admin_monitor');
    console.log('Admin joined global monitor room');
  }

  // Admin joins order notifications room
  @SubscribeMessage('joinAdminOrders')
  handleJoinAdminOrders(@ConnectedSocket() client: Socket) {
    client.join('admin_orders');
    console.log('Admin joined admin_orders room');
  }

  // 3. Rider sends location and status update
  @SubscribeMessage('updateRiderLocation')
  handleRiderLocationUpdate(
    @MessageBody() data: { 
      riderId: string;
      orderId?: string; 
      latitude: number; 
      longitude: number;
      bearing: number;
      status: string;
    },
  ) {
    const payload = {
      ...data,
      timestamp: new Date().toISOString(),
    };

    // Broadcast to the specific order room (for the customer)
    if (data.orderId) {
      this.server.to(`order_${data.orderId}`).volatile.emit('riderMoved', payload);
    }

    // Broadcast to the admin monitor room
    this.server.to('admin_monitor').volatile.emit('adminRiderUpdate', payload);
  }

  // 4. Rider joins zone-based room for nearby order notifications
  @SubscribeMessage('joinRiderZone')
  handleJoinRiderZone(
    @MessageBody() data: { latitude: number; longitude: number },
    @ConnectedSocket() client: Socket,
  ) {
    // Join a zone room based on rounded coordinates (e.g., 28.6_77.5)
    const zoneKey = `${Math.round(data.latitude * 10)}_${Math.round(data.longitude * 10)}`;
    client.join(`zone_${zoneKey}`);
    console.log(`Rider joined zone: ${zoneKey} (lat: ${data.latitude}, lng: ${data.longitude})`);
  }

  // 5. Rider joins general queue for all orders (fallback)
  @SubscribeMessage('joinRidersQueue')
  handleJoinRidersQueue(@ConnectedSocket() client: Socket) {
    client.join('riders_queue');
    console.log('Rider joined riders_queue room');
  }
}
