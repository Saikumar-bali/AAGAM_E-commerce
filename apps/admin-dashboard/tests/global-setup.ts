import { execSync } from 'child_process';
import path from 'path';

async function globalSetup() {
  console.log('[global-setup] Running QA seed script...');
  const seedPath = path.resolve(__dirname, 'qa-seed.js');
  try {
    execSync(`node "${seedPath}"`, {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit',
      timeout: 30000,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PLAYWRIGHT_QA_SEED: 'true',
      },
    });
    console.log('[global-setup] QA seed completed successfully.');
  } catch (e: any) {
    console.error('[global-setup] QA seed failed:', e.message);
    throw e;
  }
}

export default globalSetup;
