import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve } from 'path';

const repositoryRoot = resolve(__dirname, '../../..');

function productionSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) return productionSourceFiles(path);
    if (!path.endsWith('.ts') || path.endsWith('.spec.ts')) return [];
    return [path];
  });
}

describe('production deployment safety', () => {
  it('keeps the low-memory VPS deployment on the supported runtime', () => {
    const deployScript = readFileSync(resolve(repositoryRoot, 'deploy.sh'), 'utf8');
    expect(deployScript).toContain('DEPLOY_NODE_VERSION="${DEPLOY_NODE_VERSION:-22.22.3}"');
    expect(deployScript).toContain('ensure_node_runtime');
    expect(deployScript).toContain('ensure_deploy_memory');
    expect(deployScript).toContain('npm_config_jobs="${npm_config_jobs:-1}"');
    expect(deployScript).toContain('--max-old-space-size=${DEPLOY_NODE_HEAP_MB}');
    expect(deployScript).toContain('--concurrency=1');
    expect(deployScript).toContain('--interpreter "$deploy_node"');
    expect(deployScript).toContain('const expectedRuntime = fs.realpathSync(process.execPath);');
    expect(deployScript).toContain('fs.realpathSync(`/proc/${pid}/exe`)');
    expect(deployScript).toContain('actualRuntime === expectedRuntime');
    expect(deployScript).not.toContain('pm2_env?.node_version');
  });

  it('does not deserialize PostgreSQL advisory lock void results', () => {
    const offenders = productionSourceFiles(resolve(repositoryRoot, 'apps/api-gateway/src'))
      .filter((path) => /\$queryRaw(?:Unsafe)?\s*\(\s*Prisma\.sql`SELECT\s+pg_advisory_xact_lock/i.test(readFileSync(path, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
