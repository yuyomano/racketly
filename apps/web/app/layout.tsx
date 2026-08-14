import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import './globals.css'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin'] })

export const viewport: Viewport = {
  themeColor: '#10b981', // emerald-500
  // Explícito (en vez de confiar en el default de Next.js) para que la página siempre se
  // renderice al ancho real del dispositivo/ventana — sin esto, algunos navegadores/OS
  // pueden aplicar un ancho de viewport "de escritorio" simulado que hace que todo el texto
  // se vea desproporcionadamente grande respecto al espacio disponible en pantallas más chicas.
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  title: { default: 'Racketly', template: '%s | Racketly' },
  description: 'La plataforma todo-en-uno para pádel y pickleball. Reserva pistas, juega torneos y conecta con la comunidad.',
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
    <html lang={locale} suppressHydrationWarning>
      <body className={inter.className}>
        <NextIntlClientProvider messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
