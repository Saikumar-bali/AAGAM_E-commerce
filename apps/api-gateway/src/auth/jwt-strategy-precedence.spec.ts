import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('JWT credential precedence', () => {
  const source = readFileSync(
    path.resolve(__dirname, 'strategies/jwt.strategy.ts'),
    'utf8',
  );

  it('uses an explicit Bearer token before an ambient access-token cookie', () => {
    const bearerExtractor = source.indexOf(
      'ExtractJwt.fromAuthHeaderAsBearerToken()',
    );
    const cookieExtractor = source.indexOf(
      'request?.cookies?.access_token',
    );

    expect(bearerExtractor).toBeGreaterThan(-1);
    expect(cookieExtractor).toBeGreaterThan(bearerExtractor);
  });
});
