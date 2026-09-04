// Paleta "Marcador" — espejo de apps/web/tailwind.config.ts. Mismos nombres de familia
// que en web (court/ink/ball/trophy/referee) para que ambas apps hablen el mismo
// lenguaje de diseño. `ball` es el acento de alta energía (usado en acciones "live"),
// antes ausente en mobile.
export const colors = {
  // court — teal petróleo, césped sintético de pádel/pickleball
  court50: '#EAF5F3',
  court100: '#D2E9E5',
  court200: '#A6D3CB',
  court300: '#79BCB0',
  court400: '#4CA495',
  court500: '#2A8A7B',
  court600: '#1B6B63',
  court700: '#155450',
  court800: '#103F3C',
  court900: '#0B2B29',

  // ball — acento de alta energía (acciones live, scoring en vivo)
  ball50: '#F7FBE3',
  ball100: '#ECF6BE',
  ball200: '#DEEE94',
  ball300: '#D2E877',
  ball400: '#CFE94D',
  ball500: '#C9E63F',
  ball600: '#A9C22C',
  ball700: '#899E22',

  // trophy — oro de medalla/torneo
  trophy50: '#FBF3E1',
  trophy100: '#F3E1B4',
  trophy400: '#D9AE4E',
  trophy500: '#C99A2E',
  trophy600: '#A87D22',
  trophy700: '#86621A',
  trophy800: '#6E4E15',

  // referee — tarjeta de árbitro
  referee50: '#FBEAE9',
  referee100: '#F3C7C4',
  referee500: '#C23B33',
  referee600: '#A22F28',

  white: '#ffffff',

  // ink — negro con matiz verde-pista
  ink50: '#EEF1F0',
  ink100: '#D8DEDB',
  ink200: '#B3BFB9',
  ink300: '#8A9C93',
  ink400: '#62786D',
  ink500: '#445A50',
  ink600: '#2E4038',
  ink700: '#1F2E28',
  ink800: '#172520',
  ink900: '#10201C',

  // Semánticos
  bg: '#F3F6F5',
  surface: '#ffffff',
  textPrimary: '#10201C',
  textSecondary: '#2E4038',
  textMuted: '#445A50', // un paso más oscuro que ink400 — fix de contraste AA
  border: '#D8DEDB',
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
}

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 999,
}

export const fontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  lg: 17,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
}

// Archivo (display, títulos) + IBM Plex Sans (texto), cargadas vía expo-font en App.tsx.
// Usar a través del componente <Text> de ../components/ui/Text, no directamente.
export const fontFamily = {
  display: 'Archivo_700Bold',
  displaySemibold: 'Archivo_600SemiBold',
  body: 'IBMPlexSans_400Regular',
  bodyMedium: 'IBMPlexSans_500Medium',
  bodySemibold: 'IBMPlexSans_600SemiBold',
  bodyBold: 'IBMPlexSans_700Bold',
}

export const shadow = {
  sm: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  lg: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 8,
  },
}

export type SportTone = 'padel' | 'pickleball'
