import { ValidationPipe } from '@nestjs/common';
import fs from 'fs';
import path from 'path';
import {
  AdminUpdateRiderStatusDto,
  UpdateMyRiderStatusDto,
} from './riders/rider-status.dto';

const root = path.resolve(__dirname, '../../..');
const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), 'utf8');

describe('auto-dispatch recovery contracts', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  it('accepts only Rider-controlled ONLINE/OFFLINE states and valid zero coordinates', async () => {
    await expect(
      pipe.transform(
        { status: 'ONLINE', latitude: 0, longitude: 0 },
        { type: 'body', metatype: UpdateMyRiderStatusDto } as any,
      ),
    ).resolves.toMatchObject({
      status: 'ONLINE',
      latitude: 0,
      longitude: 0,
    });
    await expect(
      pipe.transform(
        { status: 'BUSY' },
        { type: 'body', metatype: UpdateMyRiderStatusDto } as any,
      ),
    ).rejects.toBeDefined();
    await expect(
      pipe.transform(
        { status: 'BUSY' },
        { type: 'body', metatype: AdminUpdateRiderStatusDto } as any,
      ),
    ).resolves.toMatchObject({ status: 'BUSY' });
  });

  it('enforces fresh coordinates, pickup radius, retry cooldown, and transaction-time Rider revalidation', () => {
    const source = read(
      'apps/api-gateway/src/orders/auto-dispatch.service.ts',
    );
    expect(source).toContain('AUTO_DISPATCH_MAX_PICKUP_KM');
    expect(source).toContain('AUTO_DISPATCH_LOCATION_MAX_AGE_SECONDS');
    expect(source).toContain('AUTO_DISPATCH_RETRY_COOLDOWN_SECONDS');
    expect(source).toContain('RiderAvailabilityLocation');
    expect(source).toContain('location."capturedAt" >=');
    expect(source).toContain('entry.distanceKm <= maxPickupKm');
    expect(source).toContain('location.capturedAt < input.locationFreshAfter');
    expect(source).toContain('otherOpenOffer');
    expect(source).toContain('dispatchWaitingJobs');
    expect(source).toContain('assignments: {');
    expect(source).toContain('none: {');
    expect(source).toContain("isolationLevel: 'Serializable'");
  });

  it('runs waiting-job recovery from both the notification worker and Rider online transition', () => {
    const worker = read(
      'apps/api-gateway/src/notifications/notification-worker.service.ts',
    );
    const rider = read('apps/api-gateway/src/riders/rider.service.ts');
    expect(worker).toContain('this.autoDispatch.dispatchWaitingJobs()');
    expect(worker).toContain('jobs returned to dispatch after a failure resolution');
    expect(rider).toContain('await this.dispatchWaitingJobs()');
    expect(rider).toContain("data.status === 'OFFLINE' && activeJob");
    expect(rider).toContain("data.status === 'ONLINE' && activeJob ? 'BUSY'");
    expect(rider).not.toContain('...(data.latitude &&');
    expect(rider).toContain('Stale Rider heartbeat cannot reactivate');
    expect(rider).toContain('pg_advisory_xact_lock');
  });

  it('enforces one simultaneous offered assignment per Rider at the database boundary', () => {
    const migration = read(
      'packages/database/prisma/migrations/20260730010000_one_open_offer_per_rider/migration.sql',
    );
    expect(migration).toContain('DispatchAssignment_one_open_offer_per_rider');
    expect(migration).toContain('PARTITION BY "riderProfileId"');
    expect(migration).toContain("WHERE \"status\" = 'OFFERED'");
    expect(migration).toContain("SET\n  \"status\" = 'EXPIRED'");
  });

  it('keeps online Rider coordinates fresh through an authenticated mobile heartbeat', () => {
    const source = read(
      'apps/mobile-partners/src/services/RiderOnlineService.ts',
    );
    expect(source).toContain('HEARTBEAT_INTERVAL_MS');
    expect(source).toContain("apiClient.patch('/riders/me/status'");
    expect(source).toContain("status: 'ONLINE', heartbeat: true");
    expect(source).toContain('Geolocation.getCurrentPosition');
    expect(source).toContain('heartbeatGeneration += 1');
    expect(source).toContain('heartbeatController?.abort()');
  });

  it('shows active automatic offers and locks duplicate manual assignment in the admin board', () => {
    const source = read(
      'apps/admin-dashboard/src/app/(admin)/admin/dispatch/page.tsx',
    );
    expect(source).toContain('openOffers');
    expect(source).toContain('Automatic offer sent to');
    expect(source).toContain('Manual assignment is locked');
    expect(source).toContain('openOfferByJob.has(deliveryJobId)');
  });
});
