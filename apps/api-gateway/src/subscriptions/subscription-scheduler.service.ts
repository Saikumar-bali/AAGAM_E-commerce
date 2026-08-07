import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '@aagam/database';
import { enqueueOutboxEvent } from '../notifications/outbox.service';
import { SubscriptionOrderGenerator } from './subscription-order-generator.service';
import { RegionalRoutePlanningService } from './regional-route-planning.service';

const QUEUE_NAME = 'subscription-production';
const CYCLE_JOB = 'subscription-cycle';

@Injectable()
export class SubscriptionSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SubscriptionSchedulerService.name);
  private connection?: IORedis;
  private queue?: Queue;
  private worker?: Worker;
  private running = false;

  constructor(
    private readonly generator: SubscriptionOrderGenerator,
    private readonly runPlanning: RegionalRoutePlanningService,
  ) {}

  async onModuleInit() {
    const enabled = String(process.env.SUBSCRIPTION_SCHEDULER_ENABLED ?? 'true').toLowerCase() === 'true';
    if (!enabled || process.env.NODE_ENV === 'test') return;
    const redisUrl = process.env.REDIS_URL?.trim();
    if (!redisUrl) {
      this.logger.error('Subscription worker disabled: REDIS_URL is required for durable production scheduling');
      return;
    }

    this.connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: true,
    });
    await this.connection.connect();
    this.queue = new Queue(QUEUE_NAME, { connection: this.connection });
    const intervalMs = Math.max(60_000, Number(process.env.SUBSCRIPTION_SCHEDULER_INTERVAL_MS || 15 * 60_000));

    await this.queue.add(CYCLE_JOB, { source: 'repeatable' }, {
      jobId: 'subscription-cycle-repeatable',
      repeat: { every: intervalMs },
      attempts: Math.max(1, Number(process.env.SUBSCRIPTION_WORKER_ATTEMPTS || 5)),
      backoff: { type: 'exponential', delay: Math.max(1_000, Number(process.env.SUBSCRIPTION_WORKER_BACKOFF_MS || 10_000)) },
      removeOnComplete: 100,
      removeOnFail: false,
    });

    this.worker = new Worker(
      QUEUE_NAME,
      (job) => this.processJob(job),
      {
        connection: this.connection,
        concurrency: Math.max(1, Math.min(8, Number(process.env.SUBSCRIPTION_WORKER_CONCURRENCY || 1))),
        lockDuration: Math.max(30_000, Number(process.env.SUBSCRIPTION_WORKER_LOCK_MS || 120_000)),
      },
    );
    this.worker.on('failed', (job, error) => void this.recordTerminalFailure(job, error));
    this.worker.on('error', (error) => this.logger.error(`Subscription BullMQ worker error: ${error.message}`));
    this.logger.log(`Subscription BullMQ worker ready queue=${QUEUE_NAME} cadenceMs=${intervalMs}`);
  }

  async onModuleDestroy() {
    await this.worker?.close().catch(() => undefined);
    await this.queue?.close().catch(() => undefined);
    await this.connection?.quit().catch(() => undefined);
  }

  private async processJob(job: Job) {
    const timeoutMs = Math.max(30_000, Number(process.env.SUBSCRIPTION_WORKER_TIMEOUT_MS || 10 * 60_000));
    const correlationId = `${job.id || job.name}:${job.attemptsMade + 1}`;
    const timeout = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`Subscription worker timed out after ${timeoutMs}ms`)), timeoutMs);
      timer.unref?.();
    });
    return Promise.race([this.executeCycle(correlationId), timeout]);
  }

  private async recordTerminalFailure(job: Job | undefined, error: Error) {
    if (!job) return;
    const maxAttempts = Number(job.opts.attempts || 1);
    if (job.attemptsMade < maxAttempts) return;
    const correlationId = `${job.id || job.name}:${job.attemptsMade}`;
    await prisma.$transaction(async (tx) => {
      const failure = await tx.subscriptionWorkerFailure.upsert({
        where: { jobId: String(job.id || `${job.name}:${job.timestamp}`) },
        create: {
          jobId: String(job.id || `${job.name}:${job.timestamp}`),
          correlationId,
          attempts: job.attemptsMade,
          lastError: error.message.slice(0, 2000),
          payload: job.data ?? {},
        },
        update: {
          correlationId,
          attempts: job.attemptsMade,
          lastError: error.message.slice(0, 2000),
          payload: job.data ?? {},
          failedAt: new Date(),
          resolvedAt: null,
        },
      });
      await enqueueOutboxEvent(tx, {
        eventType: 'SUBSCRIPTION_WORKER_FAILED',
        aggregateType: 'SYSTEM',
        aggregateId: failure.id,
        payload: {
          metadata: { jobId: failure.jobId, correlationId, attempts: failure.attempts },
        },
        idempotencyKey: `subscription-worker-failed:${failure.jobId}:${failure.attempts}`,
      });
    });
  }

  private async executeCycle(correlationId: string) {
    const generated = await this.generator.generateDue(new Date(), 250, correlationId);
    const regionalPlanning = await this.runPlanning.planGeneratedDeliveries(1000, { assignRiders: true });
    if (generated.generated.length || generated.failures.length || regionalPlanning.runs.length || regionalPlanning.deferred.length) {
      this.logger.log(
        `subscription-worker correlation=${correlationId} generated=${generated.generated.length} deferred-generation=${generated.failures.length} regional-runs=${regionalPlanning.runs.length} deferred-routing=${regionalPlanning.deferred.length}`,
      );
    }
    return { correlationId, generated, runs: regionalPlanning.runs, deferredRouting: regionalPlanning.deferred };
  }

  /** Admin-only deterministic one-shot hook; not used as the production scheduler. */
  async tick() {
    if (this.running) return { skipped: true, reason: 'already-running' };
    this.running = true;
    try {
      return await this.executeCycle(`manual:${Date.now()}`);
    } finally {
      this.running = false;
    }
  }

  async readiness() {
    if (process.env.NODE_ENV === 'test') return { enabled: false, ready: true, mode: 'test' };
    if (!this.queue || !this.connection) return { enabled: false, ready: false, mode: 'bullmq', reason: 'worker-not-initialized' };
    try {
      const ping = await this.connection.ping();
      const counts = await this.queue.getJobCounts('waiting', 'active', 'delayed', 'failed');
      return { enabled: true, ready: ping === 'PONG', mode: 'bullmq', queue: QUEUE_NAME, counts };
    } catch (error: unknown) {
      return { enabled: true, ready: false, mode: 'bullmq', reason: error instanceof Error ? error.message : String(error) };
    }
  }
}
