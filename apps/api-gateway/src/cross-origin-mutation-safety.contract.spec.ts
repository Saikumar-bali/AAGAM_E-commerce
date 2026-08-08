import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../..');
const mainSource = fs.readFileSync(
  path.join(root, 'apps/api-gateway/src/main.ts'),
  'utf8',
);

describe('production cross-origin mutation safety contract', () => {
  it('adds an explicit unsafe-method Origin guard in production', () => {
    expect(mainSource).toContain("const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])");
    expect(mainSource).toContain('const allowedOrigins = new Set(corsOrigins)');
    expect(mainSource).toContain("request.headers?.origin");
    expect(mainSource).toContain('allowedOrigins.has(origin)');
    expect(mainSource).toContain("message: 'Cross-origin mutation denied'");
  });

  it('does not block non-browser or safe-method clients that omit Origin', () => {
    expect(mainSource).toContain("!unsafeMethods.has(String(request.method || '').toUpperCase()) || !origin");
    expect(mainSource).toContain('return next()');
  });

  it('keeps credentialed CORS limited to configured production origins', () => {
    expect(mainSource).toContain('origin: isProduction ? corsOrigins : true');
    expect(mainSource).toContain('credentials: true');
    expect(mainSource).toContain('CORS_ORIGINS must be set in production mode');
  });
});
