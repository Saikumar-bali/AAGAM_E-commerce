import fs from 'fs';
import path from 'path';

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

describe('role-addressed Partner notification contracts', () => {
  it('persists and queries the exact routed role instead of inferring from userId', () => {
    const schema = read('../../../../packages/database/prisma/schema.prisma');
    const routing = read('notification-routing.service.ts');
    const notifications = read('notification.service.ts');
    const inbox = read('partner-notification-inbox.service.ts');
    const controller = read('notifications.controller.ts');

    expect(schema).toContain('recipientRole  Role?');
    expect(schema).toContain('@@index([userId, recipientRole, status, createdAt])');
    expect(routing).toContain('candidateMap.set(`${user.id}:${role}`');
    expect(routing).toContain('const addStore = () => add(order?.store?.owner || null, Role.STORE_OWNER)');
    expect(routing).toContain('Role.RIDER');
    expect(notifications).toContain('recipientRole: routedRecipient.role');
    expect(notifications).toContain('${outboxEvent.id}:${routedRecipient.userId}:${routedRecipient.role}');
    expect(inbox).toContain('where: { userId, recipientRole: role as Role }');
    expect(controller).toContain("throw new ForbiddenException('The requested Partner role is no longer available')");
  });

  it('serializes all FCM registration writes before logout disables the binding', () => {
    const push = read('../../../../packages/mobile-shared/src/utils/notifications.ts');
    expect(push).toContain('const activeRegistrationWrites = new Set<Promise<unknown>>()');
    expect(push).toContain('trackRegistrationWrite');
    expect(push).toContain('export async function quiesceMobilePushRegistration()');
    expect(push).toContain('await quiesceMobilePushRegistration()');
    expect(push).toContain('resumeMobilePushRegistration()');
    expect(push).toContain('reverifyDeviceTokenBinding');
  });
});
