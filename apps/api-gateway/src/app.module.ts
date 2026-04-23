import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ProductModule } from './products/product.module';
import { StoreModule } from './stores/store.module';
import { OrderModule } from './orders/order.module';
import { RiderModule } from './riders/rider.module';
import { UploadModule } from './upload/upload.module';
import { TrackingGateway } from './tracking.gateway';
import * as redisStore from 'cache-manager-redis-yet';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../../.env',
    }),
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 3,
      },
      {
        name: 'medium',
        ttl: 10000,
        limit: 20,
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 100,
      },
    ]),
    CacheModule.register({
      isGlobal: true,
      store: redisStore,
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      ttl: 600,
    }),
    AuthModule,
    ProductModule,
    StoreModule,
    OrderModule,
    RiderModule,
    UploadModule,
  ],
  controllers: [AppController],
  providers: [AppService, TrackingGateway],
})
export class AppModule {}
