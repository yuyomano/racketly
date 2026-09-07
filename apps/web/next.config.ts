import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import { withSentryConfig } from '@sentry/nextjs'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

// Todo pasa por el gateway — él añade x-user-id desde el Authorization header
const GW = process.env.API_GATEWAY_URL || 'http://localhost:3000'

const nextConfig: NextConfig = {
  // Build standalone (server + solo los node_modules que realmente usa) — mucho más
  // liviano para la imagen Docker que copiar todo node_modules del monorepo.
  output: 'standalone',
  turbopack: {},
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.cloudflare.com' },
      { protocol: 'https', hostname: '**.r2.dev' },
      { protocol: 'https', hostname: '**.mux.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
  async rewrites() {
    return [
      // Las rutas /api/* del browser van al gateway (middleware inyecta Authorization header)
      // Las rutas con Route Handlers propios (app/api/**) tienen prioridad sobre rewrites.
      { source: '/api/auth/:path*', destination: `${GW}/api/auth/:path*` },
      { source: '/api/clubs/:path*', destination: `${GW}/api/clubs/:path*` },
      { source: '/api/courts/:path*', destination: `${GW}/api/courts/:path*` },
      { source: '/api/bookings/:path*', destination: `${GW}/api/bookings/:path*` },
      { source: '/api/guest-payments/:path*', destination: `${GW}/api/guest-payments/:path*` },
      { source: '/api/slots/:path*', destination: `${GW}/api/slots/:path*` },
      { source: '/api/credits/:path*', destination: `${GW}/api/credits/:path*` },
      { source: '/api/memberships/:path*', destination: `${GW}/api/memberships/:path*` },
      { source: '/api/professors/:path*', destination: `${GW}/api/professors/:path*` },
      { source: '/api/classes/:path*', destination: `${GW}/api/classes/:path*` },
      { source: '/api/tournaments/:path*', destination: `${GW}/api/tournaments/:path*` },
      {
        source: '/api/tournament-events/:path*',
        destination: `${GW}/api/tournament-events/:path*`,
      },
      { source: '/api/rankings/:path*', destination: `${GW}/api/rankings/:path*` },
      { source: '/api/match-requests/:path*', destination: `${GW}/api/match-requests/:path*` },
      { source: '/api/posts/:path*', destination: `${GW}/api/posts/:path*` },
      { source: '/api/groups/:path*', destination: `${GW}/api/groups/:path*` },
      { source: '/api/gear/:path*', destination: `${GW}/api/gear/:path*` },
      { source: '/api/gamification/:path*', destination: `${GW}/api/gamification/:path*` },
      { source: '/api/exchange-rates/:path*', destination: `${GW}/api/exchange-rates/:path*` },
      { source: '/api/courses/:path*', destination: `${GW}/api/courses/:path*` },
      { source: '/api/instructors/:path*', destination: `${GW}/api/instructors/:path*` },
    ]
  },
}

// withSentryConfig sin SENTRY_AUTH_TOKEN sigue funcionando (solo se salta el
// upload de source maps, que requiere login a Sentry) — no bloquea el build.
export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  disableLogger: true,
})
