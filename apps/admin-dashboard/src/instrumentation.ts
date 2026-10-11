import * as Sentry from '@sentry/nextjs';

import { isSentryEnabled, sentryDsn, sentryTracesSampleRate } from './lib/sentry-config';

/**
 * Server-side (Node + Edge) initialisation. Next loads this file for both
 * runtimes; the SDK's request handler reports uncaught route errors.
 *
 * Lives under src/ because the app uses a src directory: Next only compiles
 * instrumentation from the project's source root.
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
