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
    expect(source).toContain('AUTO_DISPATCH_CANDIDATE_RECONCILER');
    expect(source).toContain('expiresAt: { lt: offerCheckAt }');
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
    expect(rider).toContain('preserveServerBusy');
    expect(rider).toContain("existing?.status === 'BUSY'");
    expect(rider).toContain('(activeJob || preserveServerBusy)');
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
    expect(nativeService).toContain('HEARTBEAT_INTERVAL_MS = 20_000L');
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
    expect(source).toContain('HEARTBEAT_INTERVAL_MS = 20_000');
    expect(source).toContain("apiClient.post('/riders/me/heartbeat'");
    expect(source).toContain('nativeModule.start({ riderName, apiUrl, authToken })');
    expect(source).toContain('useAuthStore.getState().token');
    expect(source).toContain('Geolocation.getCurrentPosition');
    expect(source).toContain('heartbeatGeneration += 1');
    expect(source).toContain('heartbeatController?.abort()');
  });

  it('keeps Home focused on assigned work while availability and diagnostics move to Profile', () => {
    const dashboard = read(
      'apps/mobile-partners/src/screens/rider/RiderDashboard.tsx',
    );
    const profile = read(
      'apps/mobile-partners/src/screens/rider/RiderProfileScreen.tsx',
    );
    const availability = read(
      'apps/mobile-partners/src/services/RiderAvailabilityController.ts',
    );
    const diagnostics = read(
      'apps/mobile-partners/src/screens/rider/RiderTrackingDiagnosticsScreen.tsx',
    );
    // Home still keeps the native heartbeat lifecycle alive and shows only the
    // rider's assigned deliveries — no offers, no availability switch.
    expect(dashboard).toContain('RiderOnlineService.stop().catch');
    expect(dashboard).toContain('ensureRiderOnlineService');
    expect(dashboard).toContain('activeJobs');
    expect(dashboard).not.toContain('pendingOffers');
    expect(dashboard).not.toContain('performRiderOnlineTransition');
    // Availability and diagnostics now live on Profile.
    expect(profile).toContain('rider_availability_switch');
    expect(profile).toContain('performRiderOnlineTransition');
    expect(profile).toContain('performRiderOfflineTransition');
    expect(profile).toContain("navigation.navigate('TrackingDiagnostics')");
    expect(availability).toContain('PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION');
    expect(availability).toContain('PermissionsAndroid.request(background');
    expect(availability).toContain('Linking.openSettings()');
    expect(availability).toContain('requestRiderLocationPermission');
    expect(availability).toContain('maximumAge: CACHED_LOCATION_MAX_AGE_MS');
    expect(availability).toContain("riderService.sendAvailabilityHeartbeat");
    expect(diagnostics).toContain('Open location permissions');
    expect(diagnostics).toContain('Open battery optimisation');
    expect(diagnostics).toContain('Retry health check');
  });

  it('keeps subscription deliveries store-first: no rider offer until the store assigns', () => {
    const autoDispatch = read(
      'apps/api-gateway/src/orders/auto-dispatch.service.ts',
    );
    const preparation = read(
      'apps/api-gateway/src/subscriptions/subscription-preparation.service.ts',
    );
    // The generic nearest-rider sweep must skip subscription orders entirely...
    expect(autoDispatch).toContain('order: { is: { subscriptionDeliveryId: null } }');
    expect(autoDispatch).toContain('STORE_ASSIGNED_DELIVERY');
    // ...and the scheduled final-assignment step is off unless explicitly enabled.
    expect(preparation).toContain('SUBSCRIPTION_AUTO_FINAL_ASSIGN');
    expect(preparation).toContain('autoFinalAssignEnabled');
    expect(preparation).toContain('if (!this.autoFinalAssignEnabled()) return;');
  });

  it('resolves missed subscription delivery days so they stop shadowing the rider board', () => {
    const preparation = read(
      'apps/api-gateway/src/subscriptions/subscription-preparation.service.ts',
    );
    expect(preparation).toContain('resolveMissedDeliveries');
    expect(preparation).toContain('MISSED_SKIP_REASON');
    expect(preparation).toContain('MISSED_DELIVERY_GRACE_DAYS');
    expect(preparation).toContain('cancelRiderArtifactsWithinTransaction');
    expect(preparation).toContain('await this.resolveMissedDeliveries()');
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