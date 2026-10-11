import * as Sentry from '@sentry/nextjs';

import { isSentryEnabled, sentryDsn, sentryTracesSampleRate } from './sentry-config';

/**
 * Browser-side initialisation (Next 15.3+ loads instrumentation-client.ts).
 * Global handlers capture uncaught errors and unhandled rejections; the scope
 * tag separates dashboard events from API/worker events in the shared project.
 */
if (isSentryEnabled) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: sentryTracesSampleRate,
    initialScope: { tags: { service: 'admin-dashboard' } },
  });
}
