import 'dotenv/config';
import { prisma } from '@aagam/database';

async function main() {
  console.log('🚀 Worker Service starting...');
  console.log('Environment: NODE_ENV=', process.env.NODE_ENV, '| REDIS_URL=', process.env.REDIS_URL ? 'SET' : 'MISSING', '| DATABASE_URL=', process.env.DATABASE_URL ? 'SET' : 'MISSING');
  
  try {
    await prisma.$connect();
    console.log('✅ Database connected');
  } catch (err) {
    console.error('❌ Database connection failed:', err);
    throw err;
  }
  
  try {
    const Redis = (await import('ioredis')).default;
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const redisClient = new Redis(redisUrl);
    await new Promise((res, rej) => {
      redisClient.on('ready', () => { console.log('✅ Redis connected'); res(undefined); });
      redisClient.on('error', (e: Error) => { console.error('❌ Redis error:', e.message); rej(e); });
    });
  } catch (err) {
    console.error('❌ Redis connection failed:', err);
    throw err;
  }
  
  setInterval(() => {
    console.log('Checking for new orders to dispatch...');
  }, 10000);
}

main().catch(err => {
  console.error('❌ Worker crashed:', err);
  process.exit(1);
});
