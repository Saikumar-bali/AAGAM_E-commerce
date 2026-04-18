import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ProductModule } from './products/product.module';
import { StoreModule } from './stores/store.module';
import { OrderModule } from './orders/order.module';
import { RiderModule } from './riders/rider.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../../.env',
    }),
    AuthModule,
    ProductModule,
    StoreModule,
    OrderModule,
    RiderModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
