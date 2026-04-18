import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule);

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
