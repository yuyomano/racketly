import type { Metadata, Viewport } from 'next'
import { Archivo, IBM_Plex_Sans } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import './globals.css'
import { Providers } from './providers'

// Archivo — titulares, KPIs y marcadores. IBM Plex Sans — UI y cuerpo. Ver la
// auditoría de diseño ("Marcador") para por qué se reemplazó Inter por este par.
const display = Archivo({
  subsets: ['latin'],
  weight: ['700', '800', '900'],
  variable: '--font-display',
})
const body = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
})

export const viewport: Viewport = {
  themeColor: '#1B6B63', // court-600
  // Explícito (en vez de confiar en el default de Next.js) para que la página siempre se
  // renderice al ancho real del dispositivo/ventana — sin esto, algunos navegadores/OS
  // pueden aplicar un ancho de viewport "de escritorio" simulado que hace que todo el texto
  // se vea desproporcionadamente grande respecto al espacio disponible en pantallas más chicas.
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  title: { default: 'Racketly', template: '%s | Racketly' },
  description:
    'La plataforma todo-en-uno para pádel y pickleball. Reserva pistas, juega torneos y conecta con la comunidad.',
  keywords: ['padel', 'pickleball', 'pistas', 'torneos', 'reservas', 'liga'],
  openGraph: {
    title: 'Racketly',
    description: 'La plataforma todo-en-uno para pádel y pickleball',
    url: 'https://racketly.app',
    siteName: 'Racketly',
    locale: 'es_ES',
    type: 'website',
  },
  manifest: '/manifest.json',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale} suppressHydrationWarning className={`${display.variable} ${body.variable}`}>
      <body className={body.className}>
        <NextIntlClientProvider messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
