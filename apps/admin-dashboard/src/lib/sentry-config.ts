/**
 * Single source of truth for the admin dashboard's Sentry DSN.
 *
 * Mirrors apps/api-gateway/src/common/sentry-config.ts: NEXT_PUBLIC_SENTRY_DSN
 * is inlined into the browser bundle, SENTRY_DSN covers the server runtime, and
 * an unset variable falls back to the shared AAGAM project DSN so error
 * tracking works before any environment change ships. An explicitly empty
 * variable opts out.
 */
const FALLBACK_DSN =
  'https://c90214d1a7d8b5c729e9e4f9b62e0620@o4512080888266752.ingest.de.sentry.io/4512080909959248';

const publicDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const serverDsn = process.env.SENTRY_DSN;

export const sentryDsn: string = publicDsn ?? serverDsn ?? FALLBACK_DSN;

/** Reporting is on unless the DSN is empty or SENTRY_ENABLED=false. */
export const isSentryEnabled: boolean =
  sentryDsn.length > 0 &&
  process.env.NEXT_PUBLIC_SENTRY_ENABLED !== 'false' &&
  process.env.SENTRY_ENABLED !== 'false';

export const sentryTracesSampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1);
