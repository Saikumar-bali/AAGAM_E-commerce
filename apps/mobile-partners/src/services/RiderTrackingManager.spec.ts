import { RiderTrackingManager, TrackingPosition } from './RiderTrackingManager';

const flush = () => new Promise<void>((resolve) => {
  setTimeout(() => resolve(), 0);
});

describe('RiderTrackingManager', () => {
  let now: number;
  let successHandler: ((position: TrackingPosition) => void) | null;
  let errorHandler: ((error: { message?: string }) => void) | null;
  let storageValue: string | null;
  let sendPing: jest.Mock;
  let startSession: jest.Mock;
  let stopSession: jest.Mock;
  let clearWatch: jest.Mock;
  let id: number;

  const createManager = () => new RiderTrackingManager({
    location: {
      watchPosition: (success, error) => {
        successHandler = success;
        errorHandler = error;
        return 77;
      },
      clearWatch,
    },
    storage: {
      getItem: jest.fn(async () => storageValue),
      setItem: jest.fn(async (_key: string, value: string) => { storageValue = value; }),
      removeItem: jest.fn(async () => { storageValue = null; }),
    },
    sendPing,
    startSession,
    stopSession,
    now: () => now,
    createId: () => `ping-${++id}`,
  });

  beforeEach(() => {
    now = Date.parse('2026-07-11T10:00:00.000Z');
    successHandler = null;
    errorHandler = null;
    storageValue = null;
    id = 0;
    sendPing = jest.fn().mockResolvedValue({ ok: true });
    startSession = jest.fn().mockResolvedValue({ active: true });
    stopSession = jest.fn().mockResolvedValue({ active: false });
    clearWatch = jest.fn();
  });

  it('starts one watcher for the same active delivery', async () => {
    const manager = createManager();
    await manager.start({ orderId: 'order-1', deliveryJobId: 'job-1', status: 'RIDER_ASSIGNED' });
    await manager.start({ orderId: 'order-1', deliveryJobId: 'job-1', status: 'RIDER_EN_ROUTE_TO_STORE' });

    expect(startSession).toHaveBeenCalledTimes(1);
    expect(manager.getSnapshot().active).toBe(true);
    expect(manager.getSnapshot().status).toBe('RIDER_EN_ROUTE_TO_STORE');
    expect(successHandler).toBeTruthy();
  });

  it('generates monotonic retry-safe pings at the status cadence', async () => {
    const manager = createManager();
    await manager.start({ orderId: 'order-1', deliveryJobId: 'job-1', status: 'RIDER_ASSIGNED' });

    successHandler?.({ coords: { latitude: 17.7, longitude: 83.3, accuracy: 12 }, timestamp: now });
    await flush();
    expect(sendPing).toHaveBeenCalledTimes(1);
    expect(sendPing.mock.calls[0][1]).toMatchObject({ clientPingId: 'ping-1', sequence: 1 });

    now += 5_000;
    successHandler?.({ coords: { latitude: 17.7001, longitude: 83.3001 }, timestamp: now });
    await flush();
    expect(sendPing).toHaveBeenCalledTimes(1);

    now += 15_000;
    successHandler?.({ coords: { latitude: 17.7002, longitude: 83.3002 }, timestamp: now });
    await flush();
    expect(sendPing).toHaveBeenCalledTimes(2);
    expect(sendPing.mock.calls[1][1]).toMatchObject({ clientPingId: 'ping-2', sequence: 2 });
  });

  it('persists failed pings and flushes them after connectivity returns', async () => {
    sendPing.mockRejectedValueOnce(new Error('offline'));
    const manager = createManager();
    await manager.start({ orderId: 'order-1', deliveryJobId: 'job-1', status: 'OUT_FOR_DELIVERY' });

    successHandler?.({ coords: { latitude: 17.7, longitude: 83.3 }, timestamp: now });
    await flush();
    expect(manager.getSnapshot().queuedCount).toBe(1);
    expect(storageValue).toContain('ping-1');

    sendPing.mockResolvedValue({ ok: true });
    await manager.flushQueue();
    expect(manager.getSnapshot().queuedCount).toBe(0);
    expect(storageValue).toBeNull();
  });

  it('stops the watcher when the delivery becomes terminal', async () => {
    const manager = createManager();
    await manager.start({ orderId: 'order-1', deliveryJobId: 'job-1', status: 'OUT_FOR_DELIVERY' });
    manager.updateStatus('DELIVERED');
    await flush();

    expect(clearWatch).toHaveBeenCalledWith(77);
    expect(stopSession).toHaveBeenCalledWith('order-1', 'STATUS_TERMINAL');
    expect(manager.getSnapshot().active).toBe(false);
  });

  it('surfaces GPS failures without creating a ping', async () => {
    const manager = createManager();
    await manager.start({ orderId: 'order-1', deliveryJobId: 'job-1', status: 'RIDER_ASSIGNED' });
    errorHandler?.({ message: 'GPS disabled' });

    expect(manager.getSnapshot().error).toBe('GPS disabled');
    expect(sendPing).not.toHaveBeenCalled();
  });
});
