import * as Sentry from '@sentry/nextjs';

import { isSentryEnabled, sentryDsn, sentryTracesSampleRate } from './sentry-config';

/**
 * Server-side (Node + Edge) initialisation. Next loads this file for both
 * runtimes; the SDK's request handler reports uncaught route errors.
 */
export async function register() {
  if (!isSentryEnabled) return;

  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: sentryTracesSampleRate,
    initialScope: { tags: { service: 'admin-dashboard' } },
  });
}

// Next 15 routes server-side render/route failures through this hook.
export const onRequestError = Sentry.captureRequestError;
