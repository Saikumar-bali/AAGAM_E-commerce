import 'dotenv/config';
import { prisma } from '@aagam/database';
import IORedis from 'ioredis';

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
  process.exit(1);
});
