import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SubscriptionOrderGenerator } from './subscription-order-generator.service';
import { DeliveryRunPlanningService } from './delivery-run-planning.service';

@Injectable()
export class SubscriptionSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SubscriptionSchedulerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly generator: SubscriptionOrderGenerator,
    private readonly runPlanning: DeliveryRunPlanningService,
  ) {}

  onModuleInit() {
    const enabled = String(process.env.SUBSCRIPTION_SCHEDULER_ENABLED ?? 'true').toLowerCase() === 'true';
    if (!enabled || process.env.NODE_ENV === 'test') return;
    const intervalMs = Math.max(60_000, Number(process.env.SUBSCRIPTION_SCHEDULER_INTERVAL_MS || 15 * 60_000));
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref?.();
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    if (this.running) return { skipped: true, reason: 'already-running' };
    this.running = true;
    try {
      const generated = await this.generator.generateDue(new Date(), 250);
      const runs = await this.runPlanning.planGeneratedDeliveries(1000);
      if (generated.generated.length || generated.failures.length || runs.length) {
        this.logger.log(
          `subscription scheduler generated=${generated.generated.length} deferred=${generated.failures.length} runs=${runs.length}`,
        );
      }
      return { generated, runs };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Subscription scheduler failed: ${message}`);
      throw error;
    } finally {
      this.running = false;
    }
  }
}
