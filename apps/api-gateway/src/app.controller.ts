import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { prisma } from '@aagam/database';
import { createClient } from 'redis';
import { AppService } from './app.service';

async function pingRedis(redisUrl: string, timeoutMs = 2500) {
  const client = createClient({ url: redisUrl });
  let timer: NodeJS.Timeout | undefined;

  try {
    await Promise.race([
      client.connect(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Redis connection timed out')), timeoutMs);
      }),
    ]);
    await client.ping();
    return true;
  } finally {
    if (timer) clearTimeout(timer);
    if (client.isOpen) await client.quit();
  }
}

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: 'aagam-api-gateway',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  @Get('ready')
  async getReady() {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ready',
        checks: {
          database: 'ok',
        },
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        checks: {
          database: 'failed',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  @Get('ready/realtime')
  async getRealtimeReady() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    try {
      await pingRedis(redisUrl);
      return {
        status: 'ready',
        checks: {
          redis: 'ok',
          websocketAdapter: 'redis',
        },
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        checks: {
          redis: 'failed',
          websocketAdapter: process.env.NODE_ENV === 'production' ? 'required' : 'fallback_allowed',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
}
