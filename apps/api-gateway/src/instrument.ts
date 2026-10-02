import { initSentry } from './common/sentry-config';

// Must run before anything else imports @sentry/node so global handlers,
// tracing and the transport are configured first.
initSentry();
