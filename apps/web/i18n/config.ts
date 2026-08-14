// Constantes de locale sin dependencias de servidor (next/headers) — para que también
// las puedan importar componentes cliente como el selector de idioma.
export const LOCALES = ['es', 'en'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'es'
export const LOCALE_COOKIE = 'NEXT_LOCALE'
