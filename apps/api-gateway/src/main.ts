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

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule);

    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    try {
      const redisIoAdapter = new RedisIoAdapter(app);
      await redisIoAdapter.connectToRedis(redisUrl);
      app.useWebSocketAdapter(redisIoAdapter);
      console.log('✅ Redis adapter connected for WebSockets');
    } catch (redisError) {
      console.warn('⚠️ Redis not available, using default WebSocket adapter:', redisError);
      app.useWebSocketAdapter(new IoAdapter(app));
    }

    app.use(cookieParser());

    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));

    app.enableCors({
      origin: ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001'],
      credentials: true,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    });

    // Listen on 0.0.0.0 to avoid IPv6/IPv4 localhost issues on Windows
    await app.listen(3000, '0.0.0.0');
    console.log(`✅ API Gateway is live at: http://localhost:3000`);
  } catch (error) {
    console.error('❌ Failed to start API Gateway:', error);
  }
}
bootstrap();
