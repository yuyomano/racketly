import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'
import { LOCALES, DEFAULT_LOCALE, LOCALE_COOKIE, type Locale } from './config'

// Sin prefijo de idioma en la URL — el locale se guarda en una cookie (igual que el
// token de sesión) para no reestructurar todas las rutas existentes bajo /[locale]/...
//
// Mensajes divididos en un archivo por página (messages/{locale}/{page}.json) en vez
// de uno solo gigante — así distintas páginas se pueden migrar en paralelo sin pisarse
// el mismo archivo, y cada uno queda del tamaño de la página que traduce.
const NAMESPACE_FILES = [
  'common',
  'reservas',
  'jugadores',
  'canchas',
  'torneos',
  'clases',
  'membresias',
  'caja',
  'misclubs',
  'estadisticas',
  'administradores',
  // Web de jugadores (app/(app), app/(auth))
  'appnav',
  'booking',
  'tournamentsapp',
  'academy',
  'profile',
  'auth',
  'community',
] as const

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value
  const locale: Locale = LOCALES.includes(cookieLocale as Locale)
    ? (cookieLocale as Locale)
    : DEFAULT_LOCALE

  const parts = await Promise.all(
    NAMESPACE_FILES.map((ns) => import(`../messages/${locale}/${ns}.json`).then((m) => m.default))
  )
  const messages = Object.assign({}, ...parts)

  return { locale, messages }
})
