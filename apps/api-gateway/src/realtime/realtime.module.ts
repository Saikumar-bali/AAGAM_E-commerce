import { Global, Module } from '@nestjs/common';

import { TrackingGateway } from '../tracking.gateway';
import { AuthModule } from '../auth/auth.module';

/**
 * Global realtime module so any feature module (checkout, orders, etc.)
 * can emit websocket events without duplicating gateway instances.
 */
@Global()
@Module({
  imports: [AuthModule],
  providers: [TrackingGateway],
  exports: [TrackingGateway],
})
export class RealtimeModule {}

