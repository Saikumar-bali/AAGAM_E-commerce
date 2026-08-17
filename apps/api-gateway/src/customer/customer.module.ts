import { Module } from '@nestjs/common';

import { CustomerAdminController } from './customer-admin.controller';
import { CustomerAdminService } from './customer-admin.service';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';

@Module({
  controllers: [CustomerController, CustomerAdminController],
  providers: [CustomerService, CustomerAdminService],
  exports: [CustomerService],
})
export class CustomerModule {}
