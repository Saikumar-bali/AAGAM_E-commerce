import { withConnectionPoolDefaults } from '@aagam/database';

describe('database connection pool defaults', () => {
  it('raises the pool size when DATABASE_URL does not set one', () => {
    const url = withConnectionPoolDefaults(
      'postgresql://user:pass@localhost:5432/aagam?schema=public',
    );
    expect(url).toContain('connection_limit=10');
    expect(url).toContain('pool_timeout=20');
    expect(url).toContain('schema=public');
  });

  it('keeps explicit pool settings', () => {
    const url = withConnectionPoolDefaults(
      'postgresql://u:p@h:5432/db?connection_limit=5&pool_timeout=30',
    );
    expect(url).toContain('connection_limit=5');
    expect(url).toContain('pool_timeout=30');
    expect(url).not.toContain('connection_limit=10');
  });

  it('never touches a PgBouncer transaction-pooler URL', () => {
    const raw = 'postgresql://u:p@aws-0.example:6543/postgres?pgbouncer=true';
    expect(withConnectionPoolDefaults(raw)).toBe(raw);
  });

  it('returns missing or unparsable URLs unchanged', () => {
    expect(withConnectionPoolDefaults('not a url')).toBe('not a url');
    expect(withConnectionPoolDefaults(undefined)).toBeUndefined();
  });
});
