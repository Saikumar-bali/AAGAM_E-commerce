import { SubscriptionAdminReportingService } from './subscription-admin-reporting.service';
import { Role } from '@aagam/database';

jest.mock('@aagam/database', () => {
  // Every enum member access resolves to its own name so module-level lookup
  // tables in the service can be built without importing the real Prisma client.
  const anyEnum = new Proxy({}, { get: (_t, prop) => String(prop) });
  return {
    prisma: {
      store: { findUnique: jest.fn() },
      user: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      customerAddress: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      customerSubscription: { findFirst: jest.fn() },
    },
    Role: { ADMIN: 'ADMIN', STORE_OWNER: 'STORE_OWNER', RIDER: 'RIDER', CUSTOMER: 'CUSTOMER' },
    Prisma: {},
    SubscriptionDeliveryStatus: anyEnum,
    CustomerSubscriptionStatus: anyEnum,
    SubscriptionIssueStatus: anyEnum,
    SubscriptionProofMode: anyEnum,
    DeliveryJobStatus: anyEnum,
    DeliveryRunStatus: anyEnum,
    CashDepositBatchStatus: anyEnum,
  };
});

jest.mock('../contact-verification/contact-otp.service', () => ({
  normalizePhoneE164: (phone: string) => '+91' + phone.replace(/\D/g, ''),
}));

const { prisma } = jest.requireMock('@aagam/database');

const dto = {
  name: 'QA Dup Submit',
  phone: '9000000301',
  line1: '1 Dup Rd',
  city: 'Anakapalle',
  state: 'Andhra Pradesh',
  pincode: '531001',
  storeId: 'store-1',
};

/**
 * Submitting the manual-customer form twice resolves to the same customer by
 * phone, but the old code still appended a second identical "Home" address on
 * every submit (and flipped which one was default). The second submit must
 * update the existing address in place.
 */
describe('createOfflineCustomer address de-duplication', () => {
  const service = new SubscriptionAdminReportingService({} as never);
  const actor = { id: 'owner-1', role: Role.STORE_OWNER };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.store.findUnique.mockResolvedValue({ id: 'store-1' });
    prisma.customerSubscription.findFirst.mockResolvedValue(null);
    prisma.customerAddress.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.update.mockImplementation(async ({ data }: any) => ({ id: 'cust-1', ...data }));
  });

  it('reuses an existing identical address instead of creating a duplicate', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'cust-1',
      name: dto.name,
      phone: '9000000301',
      email: 'offline.9000000301@aagaam.local',
      acquisitionSource: 'OFFLINE_STORE',
      offlineStoreId: 'store-1',
    });
    prisma.customerAddress.findFirst.mockResolvedValue({ id: 'addr-1' });
    prisma.customerAddress.update.mockResolvedValue({ id: 'addr-1', isDefault: true });

    const result = await service.createOfflineCustomer(dto, actor);

    expect(prisma.customerAddress.create).not.toHaveBeenCalled();
    expect(prisma.customerAddress.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'cust-1', line1: '1 Dup Rd', pincode: '531001' }) }),
    );
    expect(prisma.customerAddress.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'addr-1' }, data: expect.objectContaining({ isDefault: true }) }),
    );
    expect(result.address.id).toBe('addr-1');
  });

  it('creates a fresh address when no identical one exists', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'cust-2',
      name: dto.name,
      phone: '9000000301',
      email: 'offline.9000000301@aagaam.local',
    });
    prisma.customerAddress.findFirst.mockResolvedValue(null);
    prisma.customerAddress.create.mockResolvedValue({ id: 'addr-2', isDefault: true });

    const result = await service.createOfflineCustomer(dto, actor);

    expect(prisma.customerAddress.create).toHaveBeenCalledTimes(1);
    expect(result.address.id).toBe('addr-2');
  });
});
