import {
  DeliveryJobStatus,
  isTrackableDeliveryStatus,
  trackingIntervalForStatus,
} from '../domain/riderWorkspace';
import { RiderLocationPayload } from '../api/riderService';

export type TrackingPosition = {
  coords: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    speed?: number | null;
    heading?: number | null;
  };
  timestamp?: number;
};

export type LocationProvider = {
  watchPosition: (
    success: (position: TrackingPosition) => void,
    error: (error: { code?: number; message?: string }) => void,
    options: Record<string, unknown>,
  ) => number;
  clearWatch: (watchId: number) => void;
};

export type TrackingStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

export type QueuedLocationPing = RiderLocationPayload & {
  orderId: string;
};

export type TrackingMode = 'NATIVE_FOREGROUND_SERVICE' | 'JAVASCRIPT_WATCHER' | null;

export type TrackingSnapshot = {
  active: boolean;
  orderId: string | null;
  deliveryJobId: string | null;
  status: DeliveryJobStatus | null;
  lastSentAt: string | null;
  lastAccuracy: number | null;
  queuedCount: number;
  error: string | null;
  mode?: TrackingMode;
  stopReason?: string | null;
};

export type NativeTrackingStatus = {
  supported?: boolean;
  active?: boolean;
  orderId?: string | null;
  deliveryJobId?: string | null;
  deliveryStatus?: DeliveryJobStatus | null;
  lastSentAt?: string | null;
  lastAccuracy?: number | null;
  queuedCount?: number;
  error?: string | null;
  stopReason?: string | null;
};

type SessionStartResult = {
  nativeTracking?: boolean;
  getNativeStatus?: () => Promise<NativeTrackingStatus>;
};

type TrackingDependencies = {
  location: LocationProvider;
  storage: TrackingStorage;
  sendPing: (orderId: string, payload: RiderLocationPayload) => Promise<unknown>;
  startSession: (
    orderId: string,
    deliveryJobId: string,
    status: DeliveryJobStatus,
  ) => Promise<unknown>;
  stopSession: (orderId: string, reason: string) => Promise<unknown>;
  getNativeStatus?: () => Promise<NativeTrackingStatus>;
  now?: () => number;
  createId?: () => string;
};

const QUEUE_KEY = 'aagam:rider:location-queue:v1';
const NATIVE_STATUS_POLL_MS = 5_000;

function defaultId() {
  return `ping-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export class RiderTrackingManager {
  private readonly dependencies: TrackingDependencies;
  private watchId: number | null = null;
  private nativeStatusTimer: ReturnType<typeof setInterval> | null = null;
  private nativeStatusReader: (() => Promise<NativeTrackingStatus>) | null = null;
  private nativeManaged = false;
  private sequence = 0;
  private lastCaptureAt = 0;
  private queue: QueuedLocationPing[] = [];
  private flushing = false;
  private pollingNativeStatus = false;
  private listeners = new Set<(snapshot: TrackingSnapshot) => void>();
  private snapshot: TrackingSnapshot = {
    active: false,
    orderId: null,
    deliveryJobId: null,
    status: null,
    lastSentAt: null,
    lastAccuracy: null,
    queuedCount: 0,
    error: null,
    mode: null,
    stopReason: null,
  };

  constructor(dependencies: TrackingDependencies) {
    this.dependencies = dependencies;
    this.nativeStatusReader = dependencies.getNativeStatus || null;
  }

  getSnapshot() {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: TrackingSnapshot) => void) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async start(input: { orderId: string; deliveryJobId: string; status: DeliveryJobStatus }) {
    if (!isTrackableDeliveryStatus(input.status)) {
      await this.stop('STATUS_NOT_TRACKABLE');
      return;
    }

    if (this.snapshot.active && this.snapshot.orderId === input.orderId) {
      this.setSnapshot({
        deliveryJobId: input.deliveryJobId,
        status: input.status,
        stopReason: null,
      });
      if (this.nativeManaged) {
        const refreshed = await this.dependencies.startSession(
          input.orderId,
          input.deliveryJobId,
          input.status,
        ) as SessionStartResult | undefined;
        if (refreshed?.getNativeStatus) {
          this.nativeStatusReader = refreshed.getNativeStatus;
        }
        await this.pollNativeStatus();
      }
      return;
    }

    if (this.snapshot.active) await this.stop('DELIVERY_CHANGED');

    await this.restoreQueue();
    const session = await this.dependencies.startSession(
      input.orderId,
      input.deliveryJobId,
      input.status,
    ) as SessionStartResult | undefined;
    this.nativeManaged = Boolean(session?.nativeTracking);
    this.nativeStatusReader = session?.getNativeStatus
      || this.dependencies.getNativeStatus
      || null;
    this.sequence = this.nextSequenceForOrder(input.orderId);
    this.lastCaptureAt = 0;
    this.setSnapshot({
      active: true,
      orderId: input.orderId,
      deliveryJobId: input.deliveryJobId,
      status: input.status,
      error: null,
      queuedCount: this.queue.length,
      mode: this.nativeManaged ? 'NATIVE_FOREGROUND_SERVICE' : 'JAVASCRIPT_WATCHER',
      stopReason: null,
    });

    // A queue created by a previous JS fallback is flushed once before native
    // ownership begins. Android then owns all new location collection and retry.
    await this.flushQueue();

    if (this.nativeManaged) {
      this.startNativeStatusPolling();
      await this.pollNativeStatus();
      return;
    }

    this.watchId = this.dependencies.location.watchPosition(
      (position) => void this.capture(position),
      (error) => this.setSnapshot({ error: error.message || 'Location is unavailable.' }),
      {
        enableHighAccuracy: true,
        distanceFilter: 15,
        interval: 8_000,
        fastestInterval: 5_000,
        showsBackgroundLocationIndicator: true,
      },
    );
  }

  updateStatus(status: DeliveryJobStatus) {
    if (!isTrackableDeliveryStatus(status)) {
      void this.stop('STATUS_TERMINAL');
      return;
    }

    this.setSnapshot({ status });
    if (
      this.nativeManaged
      && this.snapshot.orderId
      && this.snapshot.deliveryJobId
    ) {
      void this.dependencies.startSession(
        this.snapshot.orderId,
        this.snapshot.deliveryJobId,
        status,
      ).then((result) => {
        const refreshed = result as SessionStartResult | undefined;
        if (refreshed?.getNativeStatus) {
          this.nativeStatusReader = refreshed.getNativeStatus;
        }
        return this.pollNativeStatus();
      }).catch((error: any) => {
        this.setSnapshot({
          error: error?.response?.data?.message
            || error?.message
            || 'Could not update native tracking cadence.',
        });
      });
    }
  }

  async stop(reason = 'MANUAL_STOP') {
    const orderId = this.snapshot.orderId;
    this.stopNativeStatusPolling();

    if (this.watchId !== null) {
      this.dependencies.location.clearWatch(this.watchId);
      this.watchId = null;
    }

    if (!this.nativeManaged) {
      await this.flushQueue();
    }
    if (orderId) {
      await this.dependencies.stopSession(orderId, reason).catch(() => undefined);
    }

    this.nativeManaged = false;
    this.nativeStatusReader = this.dependencies.getNativeStatus || null;
    this.setSnapshot({
      active: false,
      orderId: null,
      deliveryJobId: null,
      status: null,
      error: null,
      mode: null,
      stopReason: reason,
    });
  }

  async flushQueue() {
    if (this.flushing || this.queue.length === 0) return;
    this.flushing = true;
    try {
      while (this.queue.length > 0) {
        const next = this.queue[0];
        try {
          await this.dependencies.sendPing(next.orderId, {
            latitude: next.latitude,
            longitude: next.longitude,
            accuracy: next.accuracy,
            speed: next.speed,
            heading: next.heading,
            clientPingId: next.clientPingId,
            sequence: next.sequence,
            capturedAt: next.capturedAt,
          });
          this.queue.shift();
          await this.persistQueue();
          this.setSnapshot({
            lastSentAt: new Date(this.now()).toISOString(),
            lastAccuracy: next.accuracy ?? null,
            queuedCount: this.queue.length,
            error: null,
          });
        } catch (error: any) {
          this.setSnapshot({
            queuedCount: this.queue.length,
            error: error?.response?.data?.message || error?.message || 'Location update queued for retry.',
          });
          break;
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  private startNativeStatusPolling() {
    this.stopNativeStatusPolling();
    if (!this.nativeStatusReader) return;
    this.nativeStatusTimer = setInterval(() => {
      void this.pollNativeStatus();
    }, NATIVE_STATUS_POLL_MS);
  }

  private stopNativeStatusPolling() {
    if (this.nativeStatusTimer !== null) {
      clearInterval(this.nativeStatusTimer);
      this.nativeStatusTimer = null;
    }
  }

  private async pollNativeStatus() {
    if (!this.nativeManaged || !this.nativeStatusReader || this.pollingNativeStatus) {
      return;
    }
    this.pollingNativeStatus = true;
    try {
      const status = await this.nativeStatusReader();
      this.setSnapshot({
        active: status.active !== false,
        orderId: status.orderId ?? this.snapshot.orderId,
        deliveryJobId: status.deliveryJobId ?? this.snapshot.deliveryJobId,
        status: status.deliveryStatus ?? this.snapshot.status,
        lastSentAt: status.lastSentAt ?? this.snapshot.lastSentAt,
        lastAccuracy: status.lastAccuracy ?? this.snapshot.lastAccuracy,
        queuedCount: Number(status.queuedCount || 0),
        error: status.error || null,
        mode: 'NATIVE_FOREGROUND_SERVICE',
        stopReason: status.stopReason || null,
      });
      if (status.active === false) {
        this.stopNativeStatusPolling();
      }
    } catch (error: any) {
      this.setSnapshot({
        error: error?.message || 'Could not read native tracking status.',
      });
    } finally {
      this.pollingNativeStatus = false;
    }
  }

  private async capture(position: TrackingPosition) {
    const orderId = this.snapshot.orderId;
    const status = this.snapshot.status;
    if (this.nativeManaged || !this.snapshot.active || !orderId || !status) return;

    const now = this.now();
    if (this.lastCaptureAt > 0 && now - this.lastCaptureAt < trackingIntervalForStatus(status)) return;
    this.lastCaptureAt = now;
    this.sequence += 1;

    const ping: QueuedLocationPing = {
      orderId,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy ?? undefined,
      speed: position.coords.speed ?? undefined,
      heading: position.coords.heading ?? undefined,
      clientPingId: this.createId(),
      sequence: this.sequence,
      capturedAt: new Date(position.timestamp || now).toISOString(),
    };

    this.queue.push(ping);
    this.queue = this.queue.slice(-200);
    await this.persistQueue();
    this.setSnapshot({ queuedCount: this.queue.length, lastAccuracy: ping.accuracy ?? null });
    await this.flushQueue();
  }

  private async restoreQueue() {
    try {
      const raw = await this.dependencies.storage.getItem(QUEUE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      this.queue = Array.isArray(parsed) ? parsed.slice(-200) : [];
    } catch {
      this.queue = [];
    }
    this.setSnapshot({ queuedCount: this.queue.length });
  }

  private async persistQueue() {
    if (this.queue.length === 0) {
      await this.dependencies.storage.removeItem(QUEUE_KEY);
      return;
    }
    await this.dependencies.storage.setItem(QUEUE_KEY, JSON.stringify(this.queue));
  }

  private nextSequenceForOrder(orderId: string) {
    return this.queue
      .filter((ping) => ping.orderId === orderId)
      .reduce((max, ping) => Math.max(max, Number(ping.sequence) || 0), 0);
  }

  private now() {
    return this.dependencies.now ? this.dependencies.now() : Date.now();
  }

  private createId() {
    return this.dependencies.createId ? this.dependencies.createId() : defaultId();
  }

  private setSnapshot(patch: Partial<TrackingSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener(this.snapshot));
  }
}
