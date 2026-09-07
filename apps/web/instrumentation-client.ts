// Sentry lado cliente (browser). Sin NEXT_PUBLIC_SENTRY_DSN (dev, o antes de tener
// cuenta configurada), Sentry.init queda deshabilitado — no revienta el build ni
// manda nada, solo no reporta.
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
