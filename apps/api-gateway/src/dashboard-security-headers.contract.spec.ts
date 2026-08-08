import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../..');
const nextConfig = fs.readFileSync(
  path.join(root, 'apps/admin-dashboard/next.config.js'),
  'utf8',
);

describe('dashboard security configuration contract', () => {
  it('sets baseline browser security headers', () => {
    expect(nextConfig).toContain("key: 'X-Content-Type-Options'");
    expect(nextConfig).toContain("value: 'nosniff'");
    expect(nextConfig).toContain("key: 'X-Frame-Options'");
    expect(nextConfig).toContain("value: 'DENY'");
    expect(nextConfig).toContain("key: 'Referrer-Policy'");
    expect(nextConfig).toContain("key: 'Permissions-Policy'");
    expect(nextConfig).toContain("key: 'Strict-Transport-Security'");
  });

  it('does not route missing API configuration to a fixed public HTTP host', () => {
    expect(nextConfig).toContain("process.env.API_BACKEND_URL || 'http://127.0.0.1:3005'");
    expect(nextConfig).not.toMatch(/API_BACKEND_URL\s*\|\|\s*['\"]http:\/\/(?!127\.0\.0\.1|localhost)/);
  });

  it('does not suppress dashboard TypeScript build failures', () => {
    expect(nextConfig).toContain('ignoreBuildErrors: false');
    expect(nextConfig).not.toContain('ignoreBuildErrors: true');
  });
});
