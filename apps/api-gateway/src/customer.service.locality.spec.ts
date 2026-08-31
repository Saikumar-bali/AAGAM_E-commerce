jest.mock('@aagam/database', () => ({
  prisma: {},
  Prisma: { sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }) },
}));

import { BadRequestException } from '@nestjs/common';
import { prisma } from '@aagam/database';
import { CustomerService } from './customer/customer.service';

const db = prisma as any;

const legacyAddress = {
  id: 'address-1',
  userId: 'user-1',
  line1: '12 Main Road',
  line2: null,
  landmark: null,
  city: 'Anakapalli',
  state: 'ANDHRA PRADESH',
  pincode: '531001',
  country: 'IN',
  latitude: 17.7,
  longitude: 83.0,
  isDefault: false,
};

const updateDto = (overrides: Record<string, unknown> = {}) => ({
  city: 'Anakapalli',
  state: 'ANDHRA PRADESH',
  pincode: '531001',
  ...overrides,
});

describe('CustomerService locality enforcement', () => {
  const geo = { forward: jest.fn() };
  let service: CustomerService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CustomerService(geo as any);
    db.customerAddress = { findUnique: jest.fn().mockResolvedValue(legacyAddress) };
    db.serviceableLocality = { findFirst: jest.fn() };
    db.$queryRaw = jest.fn().mockResolvedValue([{ source: 'LEGACY_UNKNOWN', accuracyMetres: null, capturedAt: null }]);
  });

  test('forward geocodes when a legacy address text changes without locality', async () => {
    geo.forward.mockResolvedValue({ ok: true, latitude: 17.8, longitude: 83.1 });
    db.$transaction = jest.fn(async (callback: (tx: any) => unknown) => callback({
      customerAddress: { update: jest.fn().mockResolvedValue({ ...legacyAddress, city: 'Visakhapatnam', latitude: 17.8, longitude: 83.1 }) },
      $executeRaw: jest.fn(),
    }));

    await service.updateAddress('user-1', 'address-1', updateDto({ city: 'Visakhapatnam' }) as any);
    expect(db.serviceableLocality.findFirst).not.toHaveBeenCalled();
    expect(geo.forward).toHaveBeenCalled();
    expect(db.$transaction).toHaveBeenCalled();
  });

  test('allows an unchanged legacy full-form update without locality', async () => {
    db.$transaction = jest.fn(async (callback: (tx: any) => unknown) => callback({
      customerAddress: { update: jest.fn().mockResolvedValue(legacyAddress) },
      $executeRaw: jest.fn(),
    }));

    await service.updateAddress('user-1', 'address-1', updateDto());
    expect(db.serviceableLocality.findFirst).not.toHaveBeenCalled();
    expect(db.$transaction).toHaveBeenCalled();
  });

  test('uses the selected locality coordinates for a legacy address update', async () => {
    db.serviceableLocality.findFirst.mockResolvedValue({
      id: 'locality-1',
      city: 'Anakapalli',
      state: 'ANDHRA PRADESH',
      pincode: '531001',
      latitude: 17.66,
      longitude: 83.01,
      isActive: true,
    });
    db.$transaction = jest.fn(async (callback: (tx: any) => unknown) => callback({
      customerAddress: { update: jest.fn().mockResolvedValue({ ...legacyAddress, latitude: 17.66, longitude: 83.01 }) },
      $executeRaw: jest.fn(),
    }));

    await service.updateAddress('user-1', 'address-1', updateDto({ localityId: 'locality-1' }) as any);
    expect(db.serviceableLocality.findFirst).toHaveBeenCalledWith({ where: { id: 'locality-1', isActive: true } });
    expect(db.$transaction).toHaveBeenCalled();
    expect(geo.forward).not.toHaveBeenCalled();
  });

  test.each([
    ['an inactive locality', undefined],
    ['a mismatched locality', { id: 'locality-1', city: 'Visakhapatnam', state: 'ANDHRA PRADESH', pincode: '530001', latitude: 17.7, longitude: 83.0, isActive: true }],
  ])('rejects %s for a legacy address update', async (_label, locality) => {
    db.serviceableLocality.findFirst.mockResolvedValue(locality);
    await expect(service.updateAddress('user-1', 'address-1', updateDto({ localityId: 'locality-1' }) as any))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  test('switches a legacy address to live GPS with the required evidence', async () => {
    db.$transaction = jest.fn(async (callback: (tx: any) => unknown) => callback({
      customerAddress: { update: jest.fn().mockResolvedValue({ ...legacyAddress, latitude: 17.8, longitude: 83.1 }) },
      $executeRaw: jest.fn(),
    }));
    const dto = updateDto({
      locationSource: 'LIVE_GPS',
      latitude: 17.8,
      longitude: 83.1,
      locationAccuracyMetres: 12,
      locationCapturedAt: '2026-08-23T00:00:00.000Z',
    });

    await service.updateAddress('user-1', 'address-1', dto as any);
    expect(db.$transaction).toHaveBeenCalled();
    expect(db.serviceableLocality.findFirst).not.toHaveBeenCalled();
  });
});
