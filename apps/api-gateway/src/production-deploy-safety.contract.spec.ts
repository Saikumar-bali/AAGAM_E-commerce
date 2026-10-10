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
    const ecosystemConfig = readFileSync(resolve(repositoryRoot, 'ecosystem.config.js'), 'utf8');
    const runtimeMigration = readFileSync(
      resolve(repositoryRoot, 'scripts/ensure-pm2-node22-runtime.sh'),
      'utf8',
    );
    const packageJson = JSON.parse(readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(deployScript).toContain('DEPLOY_NODE_VERSION="${DEPLOY_NODE_VERSION:-22.22.3}"');
    expect(deployScript).toContain('ensure_node_runtime');
    expect(deployScript).toContain('ensure_redis_runtime');
    expect(deployScript).toContain('Redis endpoint is reachable before deployment.');
    expect(deployScript).toContain('Deployment will not attempt to manage a remote Redis service.');
    expect(deployScript).toContain('sudo -n systemctl start "${service_name}.service"');
    expect(deployScript).toMatch(/npm run check:env:prod\s+ensure_redis_runtime/);
    expect(deployScript).toContain('npm_config_jobs="${npm_config_jobs:-1}"');
    expect(deployScript).toContain('--max-old-space-size=${DEPLOY_NODE_HEAP_MB}');
    expect(deployScript).toContain('--interpreter "$deploy_node"');
    expect(deployScript).toContain('const expectedRuntime = fs.realpathSync(process.execPath);');
    expect(deployScript).toContain('fs.realpathSync(`/proc/${pid}/exe`)');
    expect(deployScript).toContain('actualRuntime === expectedRuntime');
    expect(deployScript).not.toContain('pm2_env?.node_version');

    expect(packageJson.scripts['check:env:prod']).toContain('ensure-pm2-node22-runtime.sh');
    expect(runtimeMigration).toContain('if [[ -z "${DEPLOY_SHA:-}" ]]');
    expect(runtimeMigration).toContain('pm2 delete "$app_name"');
    expect(runtimeMigration).toContain('pm2 start ecosystem.config.js --only "$app_name" --update-env');
    expect(runtimeMigration).toContain('fs.realpathSync(`/proc/${pid}/exe`)');
    expect(runtimeMigration).toContain('actualRuntime === expectedRuntime');
    expect(ecosystemConfig).toContain('interpreter: nodeInterpreter');
    expect(ecosystemConfig).toContain('script: npmScript');
  });

  it('compiles the release on the runner instead of the 2 vCPU VPS', () => {
    const deployScript = readFileSync(resolve(repositoryRoot, 'deploy.sh'), 'utf8');
    const workflow = readFileSync(resolve(repositoryRoot, '.github/workflows/deploy.yml'), 'utf8');

    // The VPS must install a prebuilt archive. An on-host turbo build took
    // 40+ minutes (api-gateway `nest build` alone ~33-43 min) and repeatedly
    // hit the workflow timeout; it must not come back.
    expect(deployScript).toContain('DEPLOY_ARTIFACT_ARCHIVE="${DEPLOY_ARTIFACT_ARCHIVE:-}"');
    expect(deployScript).toContain('install_build_artifacts');
    expect(deployScript).not.toContain('npx turbo build');

    // The workflow must compile the monorepo on the runner and transfer the
    // compiled outputs to the VPS before invoking deploy.sh.
    expect(workflow).toContain('Build production artifacts');
    expect(workflow).toContain('npx turbo build');
    expect(workflow).toContain('Upload build artifacts to the server');
    expect(workflow).toContain('DEPLOY_ARTIFACT_ARCHIVE=$remote_artifact');
    expect(workflow).toContain('Restore Turbo build cache');
    expect(workflow).not.toContain('--force');

    // /tmp on the VPS is a RAM-backed tmpfs; the artifact must be staged on
    // disk. The VPS install must stay scoped to the runtime workspaces and
    // never fall back to compiling dependencies there.
    expect(workflow).toContain('/var/tmp/aagam-build-artifacts-');
    expect(deployScript).toContain('ensure_install_swap');
    expect(deployScript).toContain('--omit=dev');
    expect(deployScript).toContain('--workspace=@aagam/api-gateway');
    expect(deployScript).toContain('--workspace=@aagam/admin-dashboard');
    expect(deployScript).toContain('--workspace=@aagam/worker-service');

    // The dashboard inlines NEXT_PUBLIC_* values at compile time. They must be
    // part of the turbo task hash, or the cache restored from the CI build
    // (where those variables are unset) could ship a dashboard pointing at the
    // wrong API URL or map keys.
    const adminTurbo = JSON.parse(
      readFileSync(resolve(repositoryRoot, 'apps/admin-dashboard/turbo.json'), 'utf8'),
    ) as { extends?: string[]; tasks: { build: { env: string[] } } };
    expect(adminTurbo.extends).toContain('//');
    expect(adminTurbo.tasks.build.env).toContain('NEXT_PUBLIC_API_URL');
    expect(adminTurbo.tasks.build.env).toContain('NEXT_PUBLIC_MAPBOX_TOKEN');
    expect(adminTurbo.tasks.build.env).toContain('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY');
  });

  it('does not deserialize PostgreSQL advisory lock void results', () => {
    const offenders = productionSourceFiles(resolve(repositoryRoot, 'apps/api-gateway/src'))
      .filter((path) => /\$queryRaw(?:Unsafe)?\s*\(\s*Prisma\.sql`SELECT\s+pg_advisory_xact_lock/i.test(readFileSync(path, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
