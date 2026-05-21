import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser = require('cookie-parser');
import { ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';

class RedisIoAdapter extends IoAdapter {
  private adapterConstructor!: ReturnType<typeof createAdapter>;
  private app: any;

  constructor(app: any) {
    super(app.getHttpServer());
    this.app = app;
  }

  async connectToRedis(redisUrl: string): Promise<void> {
    const pubClient = createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();

    await Promise.all([pubClient.connect(), subClient.connect()]);

    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }
}

// API Gateway Bootstrap
async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule);

    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const isProduction = process.env.NODE_ENV === 'production';
    
    try {
      const redisIoAdapter = new RedisIoAdapter(app);
      await redisIoAdapter.connectToRedis(redisUrl);
      app.useWebSocketAdapter(redisIoAdapter);
      console.log('✅ Redis adapter connected for WebSockets');
    } catch (redisError) {
      if (isProduction) {
        console.error('❌ Redis required in production but not available:', redisError);
        process.exit(1);
      }
      console.warn('⚠️ Redis not available, using default WebSocket adapter');
      app.useWebSocketAdapter(new IoAdapter(app));
    }

    app.use(cookieParser());

    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));

    const corsOrigins = isProduction 
      ? process.env.CORS_ORIGINS?.split(',') || []
      : [
          'http://localhost:3000', 
          'http://localhost:3001', 
          'http://localhost:3005',
          'http://127.0.0.1:3000', 
          'http://127.0.0.1:3001',
          'http://127.0.0.1:3005',
          'http://192.168.0.18:3000',
          'http://192.168.0.18:3001',
          'http://localhost:5173', // Vite default
        ];
    
    app.enableCors({
      origin: isProduction ? corsOrigins : true,
      credentials: true,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      allowedHeaders: 'Content-Type,Accept,Authorization,X-Requested-With,Idempotency-Key',
    });

    const port = parseInt(process.env.PORT || '3005', 10);
    await app.listen(port, '0.0.0.0');
    console.log(`✅ API Gateway is live on port ${port} [${process.env.NODE_ENV || 'development'}]`);
  } catch (error) {
    console.error('❌ Failed to start API Gateway:', error);
    process.exit(1);
  }
}
bootstrap();
