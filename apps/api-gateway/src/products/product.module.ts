import { Module } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { AdminProductController } from './admin-product.controller';

@Module({
  controllers: [ProductController, AdminProductController],
  providers: [ProductService],
})
export class ProductModule {}
