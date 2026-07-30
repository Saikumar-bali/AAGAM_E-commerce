import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Rider online Android keep-alive contract', () => {
  const source = readFileSync(
    resolve(
      __dirname,
      '../android/app/src/main/java/com/aagampartners/RiderOnlineService.kt',
    ),
    'utf8',
  );
  const fallbackSource = readFileSync(
    resolve(__dirname, './services/RiderOnlineService.ts'),
    'utf8',
  );

  it('uses a policy-safe inexact alarm and never requires exact-alarm privileges', () => {
    expect(source).toContain('setAndAllowWhileIdle(');
    expect(source).not.toContain('setExactAndAllowWhileIdle(');
    expect(source).toContain('catch (_: SecurityException)');
  });

  it('owns authenticated location heartbeats inside the native service', () => {
    expect(source).toContain('FusedLocationProviderClient');
    expect(source).toContain('LocationRequest.Builder(');
    expect(source).toContain('/riders/me/heartbeat');
    expect(source).toContain('START_STICKY');
    expect(source).toContain('SERVER_MARKED_OFFLINE');
  });

  it('keeps native and fallback heartbeat cadence below the minimum freshness window', () => {
    expect(source).toContain('HEARTBEAT_INTERVAL_MS = 20_000L');
    expect(fallbackSource).toContain('HEARTBEAT_INTERVAL_MS = 20_000');
    expect(source).not.toContain('HEARTBEAT_INTERVAL_MS = 60_000L');
    expect(fallbackSource).not.toContain('HEARTBEAT_INTERVAL_MS = 60_000');
  });

  it('requires background permission before native recovery can collect GPS', () => {
    expect(source).toContain('Manifest.permission.ACCESS_BACKGROUND_LOCATION');
    expect(source).toContain('Build.VERSION.SDK_INT < Build.VERSION_CODES.Q');
    expect(source).toContain('BACKGROUND_LOCATION_PERMISSION_MISSING');
  });

  it('rejects stale cached coordinates before sending availability heartbeats', () => {
    expect(source).toContain('AVAILABILITY_LOCATION_MAX_AGE_MS = 180_000L');
    expect(source).toContain('private fun isFreshLocation(location: Location)');
    expect(source).toContain('System.currentTimeMillis() - capturedAt');
    expect(source).toContain('if (!isFreshLocation(location))');
    expect(source).toContain('Ignored stale availability location');
  });

  it('starts the service with the API-appropriate Android method', () => {
    expect(source).toContain('context.startForegroundService(serviceIntent)');
    expect(source).toContain('context.startService(serviceIntent)');
  });
});
