import { BadGatewayException, Controller, Get, Logger, Query, ServiceUnavailableException } from '@nestjs/common';
import { prisma } from '@aagam/database';
import { createClient } from 'redis';
import { AppService } from './app.service';
import { WebPushService } from './notifications/web-push.service';

const redisReadinessLogger = new Logger('RedisReadiness');

async function pingRedis(redisUrl: string, timeoutMs = 2500) {
  const client = createClient({ url: redisUrl });
  client.on('error', (error) => {
    redisReadinessLogger.error(
      `Redis readiness client error: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
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
    if (client.isOpen) {
      try {
        await client.quit();
      } catch (error: unknown) {
        redisReadinessLogger.warn(
          `Redis readiness cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}

@Controller()
export class AppController {
  private releaseCache: { expiresAt: number; value: any } | null = null;
  constructor(
    private readonly appService: AppService,
    private readonly webPushService: WebPushService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: 'aagam-api-gateway',
      revision: process.env.DEPLOY_SHA || 'development',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  @Get('app-releases/latest')
  async latestAppRelease(@Query('app') appInput?: string) {
    const app = String(appInput || '').toUpperCase();
    if (!['CUSTOMER', 'PARTNERS'].includes(app)) return { updateAvailable: false };
    if (!this.releaseCache || this.releaseCache.expiresAt < Date.now()) {
      try {
        const response = await fetch('https://api.github.com/repos/Saikumar-bali/AAGAM_E-commerce/releases/latest', {
          headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'aagam-api-gateway' },
        });
        if (!response.ok) throw new Error(`GitHub releases returned ${response.status}`);
        this.releaseCache = { value: await response.json(), expiresAt: Date.now() + 5 * 60 * 1000 };
      } catch {
        throw new BadGatewayException('Latest Android release is temporarily unavailable');
      }
    }
    const release = this.releaseCache.value;
    const marker = app === 'CUSTOMER' ? 'aagam-customer-' : 'aagam-partners-';
    const asset = (release.assets || []).find((item: any) => String(item.name).startsWith(marker) && String(item.name).endsWith('.apk'));
    const versionCode = Number(String(release.tag_name || '').match(/^android-(\d+)-/)?.[1] || 0);
    return { app, versionCode, versionName: release.name || release.tag_name, downloadUrl: asset?.browser_download_url || release.html_url, releaseUrl: release.html_url, publishedAt: release.published_at };
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

  @Get('ready/notifications')
  getNotificationReady() {
    const readiness = this.webPushService.getReadiness();
    const response = {
      status: readiness.configured ? 'ready' : 'not_ready',
      checks: {
        closedAppPhonePush: readiness.configured ? 'ok' : 'failed',
        provider: 'firebase-cloud-messaging',
        credentialSource: readiness.source,
        projectId: readiness.projectId || null,
        reason: readiness.configured ? null : readiness.reason || 'Firebase push provider is unavailable',
      },
      timestamp: new Date().toISOString(),
    };

    if (!readiness.configured) {
      throw new ServiceUnavailableException(response);
    }
    return response;
  }
}
