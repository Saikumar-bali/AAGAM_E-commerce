import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import cookieParser = require('cookie-parser');
import { ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';

const logger = new Logger('Bootstrap');

// Backward-compatible repair for the WILIO_FROM_PHONE typo used in an earlier
// deployment setup. TWILIO_FROM_PHONE is the canonical variable going forward.
if (!process.env.TWILIO_FROM_PHONE && process.env.WILIO_FROM_PHONE) {
  process.env.TWILIO_FROM_PHONE = process.env.WILIO_FROM_PHONE;
  logger.warn('WILIO_FROM_PHONE detected; migrate it to TWILIO_FROM_PHONE.');
}

// ─── Environment Validation ──────────────────────────────────────────────────
interface EnvCheck {
  key: string;
  requiredIn: ('production' | 'development' | 'test')[];
  default?: string;
  minLen?: number;
  description: string;
}

const ENV_CHECKS: EnvCheck[] = [
  { key: 'DATABASE_URL', requiredIn: ['production', 'development', 'test'], description: 'PostgreSQL connection string' },
  { key: 'JWT_SECRET', requiredIn: ['production', 'development', 'test'], minLen: 32, description: 'JWT signing secret (min 32 chars)' },
  { key: 'REDIS_URL', requiredIn: ['production'], default: 'redis://localhost:6379', description: 'Redis connection string (required in prod, optional in dev)' },
  { key: 'CORS_ORIGINS', requiredIn: ['production'], description: 'Comma-separated allowed origins (required in prod)' },
  { key: 'NODE_ENV', requiredIn: [], default: 'development', description: 'Node environment (development/production/test)' },
  { key: 'PORT', requiredIn: [], default: '3005', description: 'API server port' },
];

function validateEnvironment(): void {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const errors: string[] = [];

  for (const check of ENV_CHECKS) {
    const value = process.env[check.key];
    if (!value && check.requiredIn.includes(nodeEnv as any)) {
      errors.push(`  ✗ ${check.key} — REQUIRED in ${nodeEnv} mode. ${check.description}`);
      continue;
    }
    if (!value && check.default) {
      process.env[check.key] = check.default;
      logger.log(`${check.key} — using default: ${check.default}`);
      continue;
    }
    if (value && check.minLen && value.length < check.minLen) {
      errors.push(`  ✗ ${check.key} — too short (${value.length}/${check.minLen} min). ${check.description}`);
      continue;
    }
    if (value) logger.log(`${check.key} — set`);
  }

  if (nodeEnv === 'production') {
    if (process.env.PLAYWRIGHT_QA === 'true') errors.push('  ✗ PLAYWRIGHT_QA=true — MUST NOT be set in production');
    if (process.env.PLAYWRIGHT_QA_SEED === 'true') errors.push('  ✗ PLAYWRIGHT_QA_SEED=true — MUST NOT be set in production');
    const phoneMode = (process.env.PARTNER_PHONE_VERIFICATION_MODE || 'SMS_ONLY').trim().toUpperCase();
    if (phoneMode !== 'EMAIL_ONLY') {
      for (const key of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_PHONE']) {
        if (!process.env[key]?.trim()) errors.push(`  ✗ ${key} — required when phone verification is enabled`);
      }
    }
  }

  if (errors.length > 0) {
    logger.error('\nEnvironment validation failed:\n' + errors.join('\n') + '\nFix these issues before starting the server.\n');
    process.exit(1);
  }
  logger.log('Environment validation passed');
}

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
    logger.log('Validating environment...');
    validateEnvironment();
    const app = await NestFactory.create(AppModule);
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const isProduction = process.env.NODE_ENV === 'production';
    try {
      const redisIoAdapter = new RedisIoAdapter(app);
      await redisIoAdapter.connectToRedis(redisUrl);
      app.useWebSocketAdapter(redisIoAdapter);
      logger.log('Redis adapter connected for WebSockets');
    } catch (redisError) {
      if (isProduction) {
        logger.error(`Redis required in production but not available: ${redisError instanceof Error ? redisError.message : String(redisError)}`);
        process.exit(1);
      }
      logger.warn('Redis not available, using default WebSocket adapter');
      app.useWebSocketAdapter(new IoAdapter(app));
    }

    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    const corsOrigins = isProduction
      ? process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) || []
      : [
          'http://localhost:3000', 'http://localhost:3001', 'http://localhost:3005',
          'http://127.0.0.1:3000', 'http://127.0.0.1:3001', 'http://127.0.0.1:3005',
          'http://192.168.0.18:3000', 'http://192.168.0.18:3001', 'http://localhost:5173',
        ];
    if (isProduction && corsOrigins.length === 0) {
      logger.error('CORS_ORIGINS must be set in production mode');
      process.exit(1);
    }
    app.enableCors({
      origin: isProduction ? corsOrigins : true,
      credentials: true,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      allowedHeaders: 'Content-Type,Accept,Authorization,X-Requested-With,Idempotency-Key',
      maxAge: 86400,
    });
    const port = parseInt(process.env.PORT || '3005', 10);
    await app.listen(port, '0.0.0.0');
    logger.log(`API Gateway is live on port ${port} [${process.env.NODE_ENV || 'development'}]`);
  } catch (error) {
    logger.error(`Failed to start API Gateway: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
bootstrap();
