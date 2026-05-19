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
  : ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001'];

@WebSocketGateway({
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
})
export class TrackingGateway {
  @WebSocketServer()
  server!: Server;

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
}
