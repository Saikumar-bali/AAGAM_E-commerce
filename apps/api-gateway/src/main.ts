import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser = require('cookie-parser');
import { ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';

// ─── Environment Validation ──────────────────────────────────────────────────
// Fail-fast: verify critical env vars are set before starting. Production MUST
// have every required var; development/test may use safe defaults where noted.
interface EnvCheck {
  key: string;
  requiredIn: ('production' | 'development' | 'test')[];
  default?: string;
  minLen?: number;
  description: string;
}

const ENV_CHECKS: EnvCheck[] = [
  {
    key: 'DATABASE_URL',
    requiredIn: ['production', 'development', 'test'],
    description: 'PostgreSQL connection string',
  },
  {
    key: 'JWT_SECRET',
    requiredIn: ['production', 'development', 'test'],
    minLen: 32,
    description: 'JWT signing secret (min 32 chars)',
  },
  {
    key: 'REDIS_URL',
    requiredIn: ['production'],
    default: 'redis://localhost:6379',
    description: 'Redis connection string (required in prod, optional in dev)',
  },
  {
    key: 'CORS_ORIGINS',
    requiredIn: ['production'],
    description: 'Comma-separated allowed origins (required in prod)',
  },
  {
    key: 'NODE_ENV',
    requiredIn: [],
    default: 'development',
    description: 'Node environment (development/production/test)',
  },
  {
    key: 'PORT',
    requiredIn: [],
    default: '3005',
    description: 'API server port',
  },
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
      console.log(`  ✓ ${check.key} — using default: ${check.default}`);
      continue;
    }

    if (value && check.minLen && value.length < check.minLen) {
      errors.push(`  ✗ ${check.key} — too short (${value.length}/${check.minLen} min). ${check.description}`);
      continue;
    }

    if (value) {
      console.log(`  ✓ ${check.key} — set`);
    }
  }

  // Production-only guards
  if (nodeEnv === 'production') {
    if (process.env.PLAYWRIGHT_QA === 'true') {
      errors.push('  ✗ PLAYWRIGHT_QA=true — MUST NOT be set in production');
    }
    if (process.env.PLAYWRIGHT_QA_SEED === 'true') {
      errors.push('  ✗ PLAYWRIGHT_QA_SEED=true — MUST NOT be set in production');
    }
  }

  if (errors.length > 0) {
    console.error('\n❌ Environment validation failed:');
    errors.forEach((e) => console.error(e));
    console.error('\nFix these issues before starting the server.\n');
    process.exit(1);
  }

  console.log('✅ Environment validation passed\n');
}

// ─── Redis WebSocket Adapter ─────────────────────────────────────────────────
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

// ─── Bootstrap ───────────────────────────────────────────────────────────────
async function bootstrap() {
  try {
    // 1. Validate environment before anything else
    console.log('🔍 Validating environment...');
    validateEnvironment();

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
      ? process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) || []
      : [
          'http://localhost:3000', 
          'http://localhost:3001', 
          'http://localhost:3005',
          'http://127.0.0.1:3000', 
          'http://127.0.0.1:3001',
          'http://127.0.0.1:3005',
          'http://192.168.0.18:3000',
          'http://192.168.0.18:3001',
          'http://localhost:5173',
        ];

    // Fail-closed: production MUST have CORS_ORIGINS configured
    if (isProduction && corsOrigins.length === 0) {
      console.error('❌ CORS_ORIGINS must be set in production mode');
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
    console.log(`✅ API Gateway is live on port ${port} [${process.env.NODE_ENV || 'development'}]`);
  } catch (error) {
    console.error('❌ Failed to start API Gateway:', error);
    process.exit(1);
  }
}
bootstrap();
