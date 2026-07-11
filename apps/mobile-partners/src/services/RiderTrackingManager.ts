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

export type TrackingSnapshot = {
  active: boolean;
  orderId: string | null;
  deliveryJobId: string | null;
  status: DeliveryJobStatus | null;
  lastSentAt: string | null;
  lastAccuracy: number | null;
  queuedCount: number;
  error: string | null;
};

type TrackingDependencies = {
  location: LocationProvider;
  storage: TrackingStorage;
  sendPing: (orderId: string, payload: RiderLocationPayload) => Promise<unknown>;
  startSession: (orderId: string) => Promise<unknown>;
  stopSession: (orderId: string, reason: string) => Promise<unknown>;
  now?: () => number;
  createId?: () => string;
};

const QUEUE_KEY = 'aagam:rider:location-queue:v1';

function defaultId() {
  return `ping-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export class RiderTrackingManager {
  private readonly dependencies: TrackingDependencies;
  private watchId: number | null = null;
  private sequence = 0;
  private lastCaptureAt = 0;
  private queue: QueuedLocationPing[] = [];
  private flushing = false;
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
  };

  constructor(dependencies: TrackingDependencies) {
    this.dependencies = dependencies;
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
      this.updateStatus(input.status);
      return;
    }

    if (this.snapshot.active) await this.stop('DELIVERY_CHANGED');

    await this.restoreQueue();
    await this.dependencies.startSession(input.orderId);
    this.sequence = this.nextSequenceForOrder(input.orderId);
    this.lastCaptureAt = 0;
    this.setSnapshot({
      active: true,
      orderId: input.orderId,
      deliveryJobId: input.deliveryJobId,
      status: input.status,
      error: null,
      queuedCount: this.queue.length,
    });

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

    await this.flushQueue();
  }

  updateStatus(status: DeliveryJobStatus) {
    if (!isTrackableDeliveryStatus(status)) {
      void this.stop('STATUS_TERMINAL');
      return;
    }
    this.setSnapshot({ status });
  }

  async stop(reason = 'MANUAL_STOP') {
    const orderId = this.snapshot.orderId;
    if (this.watchId !== null) {
      this.dependencies.location.clearWatch(this.watchId);
      this.watchId = null;
    }

    await this.flushQueue();
    if (orderId) {
      await this.dependencies.stopSession(orderId, reason).catch(() => undefined);
    }

    this.setSnapshot({
      active: false,
      orderId: null,
      deliveryJobId: null,
      status: null,
      error: null,
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

  private async capture(position: TrackingPosition) {
    const orderId = this.snapshot.orderId;
    const status = this.snapshot.status;
    if (!this.snapshot.active || !orderId || !status) return;

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
