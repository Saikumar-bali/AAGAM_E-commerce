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
import { CustomerModule } from './customer/customer.module';
import { CheckoutModule } from './checkout/checkout.module';
import { PaymentsModule } from './payments/payments.module';
import { GeoModule } from './geo/geo.module';
import { RealtimeModule } from './realtime/realtime.module';
import * as redisStore from 'cache-manager-redis-yet';
import { NotificationsModule } from './notifications/notifications.module';
import { TrackingModule } from './tracking/tracking.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { PromotionsModule } from './promotions/promotions.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../../.env',
    }),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: process.env.PLAYWRIGHT_QA === 'true' ? 500 : 3 },
      { name: 'medium', ttl: 10000, limit: process.env.PLAYWRIGHT_QA === 'true' ? 2000 : 20 },
      { name: 'long', ttl: 60000, limit: process.env.PLAYWRIGHT_QA === 'true' ? 10000 : 60 },
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
    CustomerModule,
    CheckoutModule,
    PaymentsModule,
    GeoModule,
    RealtimeModule,
    NotificationsModule,
    TrackingModule,
    AnalyticsModule,
    PromotionsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
