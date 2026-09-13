import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

const sentryDsn =
  process.env.SENTRY_DSN ||
  'https://c90214d1a7d8b5c729e9e4f9b62e0620@o4512080888266752.ingest.de.sentry.io/4512080909959248';

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    integrations: [nodeProfilingIntegration()],
    // Tracing
    tracesSampleRate: 1.0, // Capture 100% of the transactions
    // Set sampling rate for profiling - evaluated only once per SDK.init call
    profilesSampleRate: 1.0,
    environment: process.env.NODE_ENV || 'development',
  });
}
