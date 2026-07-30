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

  it('starts the service with the API-appropriate Android method', () => {
    expect(source).toContain('context.startForegroundService(serviceIntent)');
    expect(source).toContain('context.startService(serviceIntent)');
  });
});
