import { Module } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { AdminProductController } from './admin-product.controller';
import { ProductRoutingWeightService } from './product-routing-weight.service';

@Module({
  controllers: [ProductController, AdminProductController],
  providers: [ProductService, ProductRoutingWeightService],
})
export class ProductModule {}
