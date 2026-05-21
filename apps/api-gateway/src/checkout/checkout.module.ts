import { Module } from '@nestjs/common';

import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { TrackingGateway } from '../tracking.gateway';

@Module({
  controllers: [CheckoutController],
  providers: [CheckoutService, TrackingGateway],
})
export class CheckoutModule {}

