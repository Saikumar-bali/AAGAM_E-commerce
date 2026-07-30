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
    expect(source).toContain('AUTO_DISPATCH_RECONCILE_SCAN_LIMIT');
    expect(source).toContain('waitingSweepCursor');
    expect(source).toContain('scanned < scanLimit');
    expect(source).toContain('updatedAt: { gte: retryCutoff }');
    expect(source).not.toContain('createdAt: { gte: retryCutoff }');
    expect(source).toContain('RiderAvailabilityLocation');
    expect(source).toContain('location."capturedAt" >=');
    expect(source).toContain('entry.distanceKm <= maxPickupKm');
    expect(source).toContain('location.capturedAt < input.locationFreshAfter');
    expect(source).toContain('otherOpenOffer');
    expect(source).toContain('dispatchWaitingJobs');
    expect(source).toContain(
      'while (offered < offerLimit && scanned < scanLimit)',
    );
    expect(source).toContain('{ updatedAt: { gt: after.updatedAt } }');
    expect(source).toContain("orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }]");
    expect(source).toContain('assignments: {');
    expect(source).toContain('none: {');
    expect(source).toContain("isolationLevel: 'Serializable'");
  });

  it('keeps the dedicated Rider availability table represented in the Prisma schema', () => {
    const schema = read('packages/database/prisma/schema.prisma');
    expect(schema).toContain('model RiderAvailabilityLocation');
    expect(schema).toContain('availabilityLocation     RiderAvailabilityLocation?');
    expect(schema).toContain('riderProfileId String       @id');
    expect(schema).toContain('@@index([capturedAt])');
  });

  it('runs waiting-job recovery from both the notification worker and Rider online transition', () => {
    const worker = read(
      'apps/api-gateway/src/notifications/notification-worker.service.ts',
    );
    const rider = read('apps/api-gateway/src/riders/rider.service.ts');
    expect(worker).toContain('this.autoDispatch.dispatchWaitingJobs()');
    expect(worker).toContain('jobs returned to dispatch after a failure resolution');
    expect(rider).toContain('scheduleDispatchWaitingJobs()');
    expect(rider).toContain('setImmediate(() =>');
    expect(rider).not.toContain('if (result.wakeWaitingJobs) await this.dispatchWaitingJobs()');
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

  it('keeps Android Rider availability alive from the native foreground service', () => {
    const nativeService = read(
      'apps/mobile-partners/android/app/src/main/java/com/aagampartners/RiderOnlineService.kt',
    );
    const nativeModule = read(
      'apps/mobile-partners/android/app/src/main/java/com/aagampartners/RiderOnlineModule.kt',
    );
    const manifest = read('apps/mobile-partners/android/app/src/main/AndroidManifest.xml');
    expect(nativeService).toContain('FusedLocationProviderClient');
    expect(nativeService).toContain('LocationRequest.Builder(');
    expect(nativeService).toContain('START_STICKY');
    expect(nativeService).toContain('/riders/me/heartbeat');
    expect(nativeService).toContain('EXTRA_AUTH_TOKEN');
    expect(nativeService).toContain('SERVER_MARKED_OFFLINE');
    expect(nativeService).toContain('Manifest.permission.ACCESS_BACKGROUND_LOCATION');
    expect(nativeService).toContain('BACKGROUND_LOCATION_PERMISSION_MISSING');
    expect(nativeModule).toContain('putExtra(RiderOnlineService.EXTRA_AUTH_TOKEN, authToken)');
    expect(manifest).toContain('android.permission.ACCESS_BACKGROUND_LOCATION');
    expect(manifest).toContain('android:foregroundServiceType="location"');
  });

  it('keeps online Rider coordinates fresh through an authenticated mobile heartbeat', () => {
    const source = read(
      'apps/mobile-partners/src/services/RiderOnlineService.ts',
    );
    expect(source).toContain('HEARTBEAT_INTERVAL_MS');
    expect(source).toContain("apiClient.post('/riders/me/heartbeat'");
    expect(source).toContain('nativeModule.start({ riderName, apiUrl, authToken })');
    expect(source).toContain('useAuthStore.getState().token');
    expect(source).toContain('Geolocation.getCurrentPosition');
    expect(source).toContain('heartbeatGeneration += 1');
    expect(source).toContain('heartbeatController?.abort()');
  });

  it('stops native availability when refreshed workspace state is offline', () => {
    const source = read(
      'apps/mobile-partners/src/screens/rider/RiderDashboard.tsx',
    );
    expect(source).toContain('} else {');
    expect(source).toContain('RiderOnlineService.stop().catch');
    expect(source).toContain('PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION');
    expect(source).toContain('PermissionsAndroid.request(backgroundPermission');
    expect(source).toContain('Linking.openSettings()');
  });

  it('stops the Rider availability heartbeat before signing out', () => {
    const source = read(
      'apps/mobile-partners/src/screens/rider/RiderProfileScreen.tsx',
    );
    expect(source).toContain('await RiderOnlineService.stop()');
    expect(source).toContain('await logout()');
    expect(source.indexOf('await RiderOnlineService.stop()')).toBeLessThan(
      source.indexOf('await logout()'),
    );
  });

  it('shows active automatic offers and locks duplicate manual assignment in the admin board', () => {
    const source = read(
      'apps/admin-dashboard/src/app/(admin)/admin/dispatch/page.tsx',
    );
    expect(source).toContain('openOffers');
    expect(source).toContain('Automatic offer sent to');
    expect(source).toContain('Manual assignment is locked');
    expect(source).toContain('openOfferByJob.has(deliveryJobId)');
    expect(source).toContain('riderIdsWithOpenOffer');
    expect(source).toContain('!riderIdsWithOpenOffer.has(rider.id)');
    expect(source).toContain('selectedRiderIsAvailable');
  });
});
