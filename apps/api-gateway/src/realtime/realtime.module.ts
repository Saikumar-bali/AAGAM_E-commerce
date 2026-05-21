import { Global, Module } from '@nestjs/common';

import { TrackingGateway } from '../tracking.gateway';

/**
 * Global realtime module so any feature module (checkout, orders, etc.)
 * can emit websocket events without duplicating gateway instances.
 */
@Global()
@Module({
  providers: [TrackingGateway],
  exports: [TrackingGateway],
})
export class RealtimeModule {}

