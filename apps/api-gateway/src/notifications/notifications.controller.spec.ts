import { BadRequestException } from '@nestjs/common';
import { Role } from '@aagam/database';
import { NotificationsController } from './notifications.controller';

jest.mock('@aagam/database', () => {
  const anyEnum = new Proxy({}, { get: (_t, prop) => String(prop) });
  const prisma = new Proxy({}, { get: () => new Proxy({}, { get: () => jest.fn() }) });
  return new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === '__esModule') return true;
        if (prop === 'prisma') return prisma;
        return anyEnum;
      },
    },
  );
});

/**
 * The inbox/outbox endpoints read `limit` as a raw query string and passed it
 * straight to Prisma `take`. `?limit=abc` became `take: NaN` and returned an
 * opaque HTTP 500; malformed limits must be a 400 at the boundary.
 */
describe('NotificationsController limit validation', () => {
  const notifications = { listInbox: jest.fn().mockResolvedValue([]) };
  const outbox = { listRecent: jest.fn().mockResolvedValue([]) };
  const controller = new NotificationsController(
    notifications as never,
    {} as never,
    {} as never,
    {} as never,
    outbox as never,
  );
  const req = { user: { id: 'u1', role: Role.CUSTOMER } };

  beforeEach(() => jest.clearAllMocks());

  it('rejects a non-numeric inbox limit with a 400', () => {
    expect(() => controller.inbox(req, 'abc')).toThrow(BadRequestException);
    expect(notifications.listInbox).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range inbox limit', () => {
    expect(() => controller.inbox(req, '0')).toThrow(BadRequestException);
    expect(() => controller.inbox(req, '101')).toThrow(BadRequestException);
  });

  it('passes a valid inbox limit through as a number', () => {
    controller.inbox(req, '25');
    expect(notifications.listInbox).toHaveBeenCalledWith(req.user, 25);
  });

  it('falls back to the service default when limit is omitted', () => {
    controller.inbox(req, undefined);
    expect(notifications.listInbox).toHaveBeenCalledWith(req.user, undefined);
  });

  it('rejects a non-numeric outbox limit with a 400', () => {
    expect(() => controller.listOutbox('abc')).toThrow(BadRequestException);
    expect(outbox.listRecent).not.toHaveBeenCalled();
  });

  it('passes a valid outbox limit through as a number', () => {
    controller.listOutbox('50');
    expect(outbox.listRecent).toHaveBeenCalledWith(50);
  });
});
