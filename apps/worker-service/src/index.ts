import 'dotenv/config';
import { prisma } from '@aagam/database';
import IORedis from 'ioredis';
import * as Sentry from '@sentry/node';

// Error tracking for the worker. Mirrors the API's fallback-DSN behaviour: an
// unset SENTRY_DSN uses the shared AAGAM project, an explicitly empty value
// opts out, and SENTRY_ENABLED=false disables reporting.
const SENTRY_FALLBACK_DSN =
  'https://c90214d1a7d8b5c729e9e4f9b62e0620@o4512080888266752.ingest.de.sentry.io/4512080909959248';
const sentryDsn = process.env.SENTRY_DSN === undefined ? SENTRY_FALLBACK_DSN : process.env.SENTRY_DSN;
const sentryEnabled = sentryDsn.length > 0 && process.env.SENTRY_ENABLED !== 'false';

if (sentryEnabled) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.05),
    initialScope: { tags: { service: 'worker-service' } },
  });
}

function captureWorkerError(context: string, error: unknown): void {
  if (!sentryEnabled) return;
  Sentry.withScope((scope) => {
    scope.setTag('background_job', context);
    Sentry.captureException(error);
  });
}

async function main() {
  console.log('🚀 Worker Service starting...');
  console.log(
    'Environment: NODE_ENV=',
    process.env.NODE_ENV,
    '| REDIS_URL=',
    process.env.REDIS_URL ? 'SET' : 'MISSING',
    '| DATABASE_URL=',
    process.env.DATABASE_URL ? 'SET' : 'MISSING',
  );

  await prisma.$connect();
  console.log('✅ Database connected');

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const redisClient = new IORedis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });
  await redisClient.connect();
  await redisClient.ping();
  console.log('✅ Redis connected');

  let lastRedisErrorAt = 0;
  let lastRedisErrorMessage = '';
  redisClient.on('error', (error: Error) => {
    const now = Date.now();
    if (error.message !== lastRedisErrorMessage || now - lastRedisErrorAt >= 60_000) {
      console.error('❌ Redis connection degraded:', error.message);
      lastRedisErrorAt = now;
      lastRedisErrorMessage = error.message;
      captureWorkerError('redis', error);
    }
  });

  const shutdown = async () => {
    await redisClient.quit().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());

  // The Redis socket keeps the worker alive. Actual queue consumers log only
  // state changes/errors; do not emit periodic "checking" heartbeat noise.
  console.log('✅ Worker Service ready and waiting for jobs');
}

main().catch((error) => {
  console.error(
    '❌ Worker startup failed:',
    error instanceof Error ? error.message : error,
  );
  captureWorkerError('startup', error);
  process.exit(1);
});
