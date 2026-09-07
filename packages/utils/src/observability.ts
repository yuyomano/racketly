import * as Sentry from '@sentry/node'

// Sin SENTRY_DSN (dev/test, o antes de tener cuenta configurada), initSentry() es
// un no-op — Sentry.captureException sigue siendo seguro de llamar sin init previo,
// solo no manda nada. Así los servicios no necesitan ramificar "¿está Sentry activo?".

/**
 * Inicializa Sentry para un servicio backend. Llamar una sola vez, apenas arranca
 * el proceso (antes de crear la app de Express).
 */
export function initSentry(opts: { serviceName: string; tracesSampleRate?: number }): void {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    serverName: opts.serviceName,
    tracesSampleRate: opts.tracesSampleRate ?? 0.1,
  })
}

/**
 * Envuelve un job periódico (cron, worker) para reportar excepciones no capturadas
 * a Sentry en vez de dejarlas como unhandled rejection silencioso.
 * ponytail: reporta y traga el error (el cron sigue corriendo en la próxima
 * ejecución) — si algún día un job necesita alertar/reintentar distinto, se
 * ajusta acá, no en cada callsite.
 */
export function withErrorReporting(name: string, fn: () => Promise<void>): () => Promise<void> {
  return async () => {
    try {
      await fn()
    } catch (err) {
      console.error(`[${name}] failed:`, err)
      Sentry.captureException(err, { tags: { job: name } })
    }
  }
}

export { Sentry }
