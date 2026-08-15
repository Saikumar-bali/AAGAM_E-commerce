import {
  acquireRiderAvailabilityLocation,
  performRiderOnlineTransition,
} from './RiderAvailabilityController';

describe('RiderAvailabilityController', () => {
  it('falls back from a fast cached/network timeout to a longer high-accuracy fix', async () => {
    const positionProvider = jest.fn()
      .mockRejectedValueOnce({ code: 3, message: 'Location request timed out.' })
      .mockResolvedValueOnce({ latitude: 17.7421, longitude: 83.3221 });

    await expect(acquireRiderAvailabilityLocation(positionProvider)).resolves.toEqual({
      latitude: 17.7421,
      longitude: 83.3221,
    });

    expect(positionProvider).toHaveBeenNthCalledWith(1, {
      enableHighAccuracy: false,
      timeout: 5_000,
      maximumAge: 180_000,
    });
    expect(positionProvider).toHaveBeenNthCalledWith(2, {
      enableHighAccuracy: true,
      timeout: 20_000,
      maximumAge: 180_000,
    });
  });

  it('returns an actionable error only after both location strategies fail', async () => {
    const positionProvider = jest.fn()
      .mockRejectedValueOnce({ code: 3, message: 'Location request timed out.' })
      .mockRejectedValueOnce({ code: 3, message: 'Location request timed out.' });

    await expect(acquireRiderAvailabilityLocation(positionProvider)).rejects.toThrow(
      'Location is taking too long',
    );
    expect(positionProvider).toHaveBeenCalledTimes(2);
  });

  it('does not mark the Rider successful until status, initial heartbeat and native service all succeed', async () => {
    const calls: string[] = [];
    const location = { latitude: 17.7421, longitude: 83.3221 };
    const deps = {
      requestPermission: jest.fn(async () => {
        calls.push('permission');
        return true;
      }),
      acquireLocation: jest.fn(async () => {
        calls.push('location');
        return location;
      }),
      updateStatus: jest.fn(async (status: 'ONLINE' | 'OFFLINE') => {
        calls.push(`status:${status}`);
        return { status };
      }),
      sendHeartbeat: jest.fn(async (coords: typeof location) => {
        calls.push(`heartbeat:${coords.latitude},${coords.longitude}`);
        return { status: 'ONLINE' };
      }),
      startOnlineService: jest.fn(async () => {
        calls.push('native:start');
        return true;
      }),
      stopOnlineService: jest.fn(async () => true),
    };

    await expect(performRiderOnlineTransition('Test Rider', deps)).resolves.toEqual(location);
    expect(calls).toEqual([
      'permission',
      'location',
      'status:ONLINE',
      'heartbeat:17.7421,83.3221',
      'native:start',
    ]);
  });

  it('rolls the Rider back offline when initial heartbeat/native availability startup fails', async () => {
    const location = { latitude: 17.7421, longitude: 83.3221 };
    const updateStatus = jest.fn(async (status: 'ONLINE' | 'OFFLINE') => ({ status }));
    const stopOnlineService = jest.fn(async () => true);
    const deps = {
      requestPermission: jest.fn(async () => true),
      acquireLocation: jest.fn(async () => location),
      updateStatus,
      sendHeartbeat: jest.fn(async () => ({ status: 'ONLINE' })),
      startOnlineService: jest.fn(async () => {
        throw new Error('Native service failed');
      }),
      stopOnlineService,
    };

    await expect(performRiderOnlineTransition('Test Rider', deps)).rejects.toThrow('Native service failed');
    expect(updateStatus.mock.calls).toEqual([['ONLINE'], ['OFFLINE']]);
    expect(stopOnlineService).toHaveBeenCalledTimes(1);
  });

  it('does not touch Rider status when background location permission is missing', async () => {
    const updateStatus = jest.fn();
    const deps = {
      requestPermission: jest.fn(async () => false),
      acquireLocation: jest.fn(),
      updateStatus,
      sendHeartbeat: jest.fn(),
      startOnlineService: jest.fn(),
      stopOnlineService: jest.fn(),
    };

    await expect(performRiderOnlineTransition('Test Rider', deps)).rejects.toThrow(
      'Background location is required',
    );
    expect(deps.acquireLocation).not.toHaveBeenCalled();
    expect(updateStatus).not.toHaveBeenCalled();
  });
});
