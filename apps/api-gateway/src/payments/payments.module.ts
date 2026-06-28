import { Module } from '@nestjs/common';

import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { RefundsService } from './refunds.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, RefundsService],
  exports: [RefundsService],
})
export class PaymentsModule {}

