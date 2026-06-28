/**
 * API Smoke Tests — Manual / Local Only
 *
 * These tests require a running API server on localhost:3005.
 * They are NOT safe for CI without a running server.
 *
 * Run manually:
 *   npm run test:api-smoke
 */

describe('Phase 1: RBAC API Smoke Tests (manual)', () => {
  const API = 'http://localhost:3005';

  it('GET /auth/users should require authentication (no token = rejected)', async () => {
    const { default: fetch } = await import('node-fetch');
    const res = await fetch(`${API}/auth/users`);
    expect(res.status).toBe(401);
  });

  it('GET /riders/:id should require admin role (customer token = rejected)', async () => {
    const { default: fetch } = await import('node-fetch');
    const loginRes = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'customer@aagam.com', password: 'customer123' }),
    });
    const { access_token } = (await loginRes.json()) as any;

    const res = await fetch(`${API}/riders/some-rider-id`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    expect(res.status).toBe(403);
  });

  it('GET /upload/image should require authentication', async () => {
    const { default: fetch } = await import('node-fetch');
    const res = await fetch(`${API}/upload/image`, { method: 'POST' });
    expect(res.status).toBe(401);
  });
});
