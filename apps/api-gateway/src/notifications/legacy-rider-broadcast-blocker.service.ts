import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { TrackingGateway } from '../tracking.gateway';

@Injectable()
export class LegacyRiderBroadcastBlockerService implements OnApplicationBootstrap {
  constructor(private readonly trackingGateway: TrackingGateway) {}

  onApplicationBootstrap() {
    const server = this.trackingGateway.server;
    if (!server) return;

    server.on('connection', (socket) => {
      socket.use(([event], next) => {
        if (event === 'joinRiderZone' || event === 'joinRidersQueue') {
          return next(new Error('Legacy public rider queue is disabled. Use addressed dispatch offers.'));
        }
        next();
      });
    });
  }
}
