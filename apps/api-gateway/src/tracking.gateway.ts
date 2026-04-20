import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class TrackingGateway {
  @WebSocketServer()
  server!: Server;

  // 1. Rider joins a room for a specific order
  @SubscribeMessage('joinOrder')
  handleJoinOrder(
    @MessageBody() data: { orderId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`order_${data.orderId}`);
    console.log(`Client joined room: order_${data.orderId}`);
  }

  // 2. Rider sends location update
  @SubscribeMessage('updateLocation')
  handleLocationUpdate(
    @MessageBody() data: { 
      orderId: string; 
      latitude: number; 
      longitude: number;
      bearing: number; // The direction the rider is facing
    },
  ) {
    // We broadcast to everyone in the 'order_ID' room (Customer + Admin)
    // We use 'volatile' so if a packet is lost, it doesn't slow down the stream
    this.server.to(`order_${data.orderId}`).volatile.emit('locationChanged', {
      latitude: data.latitude,
      longitude: data.longitude,
      bearing: data.bearing,
      timestamp: new Date().toISOString(),
    });
  }
}
