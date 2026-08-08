import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../..');
const devcontainerSetup = fs.readFileSync(
  path.join(root, '.devcontainer/setup.sh'),
  'utf8',
);
const codespaceStart = fs.readFileSync(
  path.join(root, 'codespace-start.sh'),
  'utf8',
);
const databaseSeed = fs.readFileSync(
  path.join(root, 'packages/database/seed.js'),
  'utf8',
);

describe('development and seed secret safety contract', () => {
  it('generates a fresh JWT secret when Codespace secrets are absent', () => {
    expect(devcontainerSetup).toContain('randomBytes(32)');
    expect(codespaceStart).toContain('randomBytes(32)');
    expect(codespaceStart).toContain('JWT_SECRET_VALUE');
    expect(codespaceStart).not.toContain('dev-jwt-secret-not-for-production');
  });

  it('requires an explicit Admin password when seeding production', () => {
    expect(databaseSeed).toContain("process.env.NODE_ENV === 'production'");
    expect(databaseSeed).toContain('Production seed requires ADMIN_PASSWORD or SEED_ADMIN_PASSWORD');
    expect(databaseSeed).toContain('process.env.SEED_DEMO_PASSWORD');
  });

  it('does not print seeded passwords to logs', () => {
    expect(databaseSeed).toContain('Passwords are never printed');
    expect(databaseSeed).not.toContain('Login credentials (from .env):');
    expect(databaseSeed).not.toMatch(/console\.log\([^\n]*(ADMIN_PASSWORD|CUSTOMER_PASSWORD|STORE_PASSWORD|RIDER_PASSWORD)/);
  });

  it('fails the seed process when seeding throws', () => {
    expect(databaseSeed).toContain('process.exitCode = 1');
  });
});
