import * as fs from 'fs';
import * as path from 'path';

const root = path.resolve(__dirname, '../../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('subscription expiration notification contracts', () => {
  const schema = read('packages/database/prisma/schema.prisma');
  const sharedTypes = read('packages/types/src/index.ts');
  const migration = read('packages/database/prisma/migrations/20260912000000_subscription_expiring_notification_enum/migration.sql');
  const controller = read('apps/api-gateway/src/subscriptions/subscriptions.controller.ts');
  const routing = read('apps/api-gateway/src/notifications/notification-routing.service.ts');
  const expiration = read('apps/api-gateway/src/subscriptions/subscription-expiration.service.ts');
  const scheduler = read('apps/api-gateway/src/subscriptions/subscription-scheduler.service.ts');
  const listPage = read('apps/admin-dashboard/src/app/(shop)/shop/subscriptions/page.tsx');
  const detailPage = read('apps/admin-dashboard/src/app/(shop)/shop/subscriptions/[id]/page.tsx');

  it('keeps the shared notification event union, Prisma enum, and deployed PostgreSQL enum in parity', () => {
    expect(sharedTypes).toContain('SUBSCRIPTION_EXPIRING');
    expect(schema).toContain('SUBSCRIPTION_EXPIRING');
    expect(migration).toContain("ALTER TYPE \"NotificationEventType\" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_EXPIRING'");
  });

  it('routes SUBSCRIPTION_EXPIRING payloads through template copy with a fallback', () => {
    expect(routing).toMatch(/eventType === 'ADMIN_BROADCAST' \|\| eventType === 'SUBSCRIPTION_EXPIRING'/);
    expect(routing).toContain('context.title ||');
    expect(routing).toContain('context.body ||');
  });

  it('treats only active non-terminal subscriptions as expiring across worker, list, detail, and expiry endpoint', () => {
    expect(expiration).toMatch(/status:\s*\{\s*notIn:\s*\[CustomerSubscriptionStatus\.CANCELLED, CustomerSubscriptionStatus\.COMPLETED\]/s);
    expect(listPage).toMatch(/TERMINAL_STATUSES/);
    expect(detailPage).toMatch(/s\.status === "CANCELLED" \|\| s\.status === "COMPLETED"/);
    expect(controller).toMatch(/sub\.status === CustomerSubscriptionStatus\.CANCELLED \|\| sub\.status === CustomerSubscriptionStatus\.COMPLETED/);
  });

  it('guards the auxiliary expiration check so it cannot abort the worker cycle', () => {
    expect(scheduler).toMatch(/try\s*\{\s*await this\.expiration\.checkAndNotify\(\);\s*\}\s*catch/);
  });
});