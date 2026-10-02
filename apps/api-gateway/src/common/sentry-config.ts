import * as Sentry from '@sentry/node';
import { Logger } from '@nestjs/common';

/**
 * Single source of truth for the Sentry DSN.
 *
 * `instrument.ts` and the exception filter previously resolved the DSN
 * differently: init used `process.env.SENTRY_DSN || FALLBACK`, while the filter
 * gated on `process.env.SENTRY_DSN` alone. Because production never set that
 * variable, the SDK initialised happily while every `captureException()` call
 * was skipped — errors looked tracked but nothing was ever reported.
 *
 * Both call sites must resolve through this module so they cannot drift again.
 */
const FALLBACK_DSN =
  'https://c90214d1a7d8b5c729e9e4f9b62e0620@o4512080888266752.ingest.de.sentry.io/4512080909959248';

// Only an unset variable falls back to the built-in DSN; an explicitly empty
// SENTRY_DSN is kept empty to honour the documented opt-out. (Equivalent to
// `??`, which treats '' as a value rather than "missing".)
export const sentryDsn: string =
  process.env.SENTRY_DSN === undefined ? FALLBACK_DSN : process.env.SENTRY_DSN;

/** Reporting is on unless explicitly disabled with SENTRY_DSN='' or SENTRY_ENABLED=false. */
export const isSentryEnabled: boolean =
  sentryDsn.length > 0 && process.env.SENTRY_ENABLED !== 'false';

/**
 * Initialise the SDK. Safe to call more than once — Sentry.init is idempotent
 * for our purposes and instrument.ts is the only intended caller.
 */
export function initSentry(): void {
  if (!isSentryEnabled) return;

  Sentry.init({
    dsn: sentryDsn,
    // Full tracing on a 2 GB VPS is expensive and burns quota. Keep sampled
    // traces; always keep errors.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    environment: process.env.NODE_ENV || 'development',
  });
}

/**
 * Report an error raised by a background job and log it.
 *
 * Background schedulers (outbox sweeps, preparation cycles, notification
 * batches) catch their own errors and only write to the Nest logger, so they
 * never reach the global exception filter. During the disk-full outage these
 * were the only errors occurring — and none reached Sentry. Use this in their
 * `catch` blocks so both the log line and the Sentry issue are produced.
 */
export function captureBackgroundError(
  logger: Logger,
  context: string,
  error: unknown,
): void {
  const message = error instanceof Error ? error.message : String(error);

  if (isSentryEnabled) {
    Sentry.withScope((scope) => {
      scope.setTag('background_job', context);
      scope.setExtra('context', context);
      if (error instanceof Error) scope.setExtra('stack', error.stack);
      Sentry.captureException(error);
    });
  }

  logger.error(`${context}: ${message}`, error instanceof Error ? error.stack : undefined);
}
