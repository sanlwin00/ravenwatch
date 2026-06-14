import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN_FRONTEND;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.2,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,
    initialScope: { tags: { service: 'ravenwatch-frontend' } },
  });
}
