import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@aagam/database';
import { createClient } from 'redis';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Welcome to Aagam E-commerce API Gateway! Server is UP and RUNNING.';
  }

  async getHealth() {
    const db = await this.checkDatabase();
    const redis = await this.checkRedis();
    const allHealthy = db.status === 'ok' && redis.status === 'ok';

    return {
      status: allHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || 'unknown',
      checks: {
        database: db,
        redis: redis,
      },
    };
  }

  async getHealthz() {
    const db = await this.checkDatabase();
    if (db.status !== 'ok') {
      return { status: 'fail', timestamp: new Date().toISOString(), database: db };
    }
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  private async checkDatabase(): Promise<{ status: string; latencyMs?: number; error?: string }> {
    const start = Date.now();
    try {
      const prisma = new PrismaClient();
      await prisma.$queryRaw`SELECT 1`;
      await prisma.$disconnect();
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (error: any) {
      return { status: 'error', latencyMs: Date.now() - start, error: error.message };
    }
  }

  private async checkRedis(): Promise<{ status: string; latencyMs?: number; error?: string }> {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const start = Date.now();
    try {
      const client = createClient({ url: redisUrl });
      await client.connect();
      await client.ping();
      await client.disconnect();
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (error: any) {
      const isProduction = process.env.NODE_ENV === 'production';
      return {
        status: isProduction ? 'error' : 'degraded',
        latencyMs: Date.now() - start,
        error: error.message,
      };
    }
  }
}
