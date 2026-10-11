import * as Sentry from '@sentry/react-native';

/**
 * Error tracking for the customer app. The DSN is the public AAGAM Sentry
 * project (same fallback the API gateway uses); bare React Native builds have
 * no build-time env plumbing, so it is kept as a literal here. Replace it with
 * a per-app Sentry project when one exists.
 */
const DSN =
  'https://c90214d1a7d8b5c729e9e4f9b62e0620@o4512080888266752.ingest.de.sentry.io/4512080909959248';

let initialised = false;

export function initSentry(): void {
  if (initialised || !DSN) return;
  initialised = true;

  Sentry.init({
    dsn: DSN,
    environment: __DEV__ ? 'development' : 'production',
    tracesSampleRate: 0.1,
    initialScope: { tags: { service: 'mobile-customer' } },
  });
}

export { Sentry };
