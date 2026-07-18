import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('Shared mobile signup security contract', () => {
  const source = readFileSync(
    path.resolve(
      __dirname,
      '../../../../packages/mobile-shared/src/store/authStore.ts',
    ),
    'utf8',
  );

  it('preserves Customer signup without accepting partner roles', () => {
    expect(source).toContain("role?: 'CUSTOMER'");
    expect(source).toContain("role !== 'CUSTOMER'");
    expect(source).toContain('Public mobile signup is customer-only');
    expect(source).not.toContain("role?: 'RIDER'");
    expect(source).not.toContain("role?: 'STORE_OWNER'");
  });

  it('does not send a role in the public signup request body', () => {
    const signupRequest = source.match(
      /apiClient\.post\('\/auth\/signup',[\s\S]*?\}\);/,
    )?.[0];
    expect(signupRequest).toBeTruthy();
    expect(signupRequest).not.toMatch(/\brole\b/);
  });
});
