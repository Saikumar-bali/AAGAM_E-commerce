import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '@aagam/database';
import { createClient } from 'redis';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

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
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (error: unknown) {
      this.logger.error(
        'Database health check failed',
        error instanceof Error ? error.stack : String(error),
      );
      return {
        status: 'error',
        latencyMs: Date.now() - start,
        error: 'Database health check failed',
      };
    }
  }

  private async checkRedis(): Promise<{ status: string; latencyMs?: number; error?: string }> {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const start = Date.now();
    const client = createClient({ url: redisUrl });
    client.on('error', (error) => {
      this.logger.error(
        `Redis health client error: ${error instanceof Error ? error.message : String(error)}`,
      );
    });

    try {
      await client.connect();
      await client.ping();
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (error: unknown) {
      const isProduction = process.env.NODE_ENV === 'production';
      this.logger.error(
        'Redis health check failed',
        error instanceof Error ? error.stack : String(error),
      );
      return {
        status: isProduction ? 'error' : 'degraded',
        latencyMs: Date.now() - start,
        error: 'Redis health check failed',
      };
    } finally {
      if (client.isOpen) {
        try {
          await client.quit();
        } catch (error: unknown) {
          this.logger.warn(
            `Redis health client cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
  }
}
