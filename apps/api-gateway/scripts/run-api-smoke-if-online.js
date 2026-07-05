const http = require('http');
const { spawnSync } = require('child_process');

const baseUrl = process.env.API_SMOKE_BASE_URL || 'http://localhost:3005';
const healthUrl = new URL('/health', baseUrl);

function checkServer(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 1500 }, (res) => {
      res.resume();
      resolve(res.statusCode && res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

(async () => {
  const online = await checkServer(healthUrl);
  if (!online) {
    console.log(`[api-smoke] Skipping: API server not reachable at ${healthUrl.toString()}`);
    console.log('[api-smoke] Start API first, then rerun npm run test:api-smoke --workspace=apps/api-gateway');
    process.exit(0);
  }

  const result = spawnSync('npx', ['jest', '--runInBand', 'api-smoke.spec.ts'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  process.exit(result.status || 0);
})();
