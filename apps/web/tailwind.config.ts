import type { Config } from 'tailwindcss'

// Sistema de color "Marcador" — construido desde el vocabulario real de una pista de
// pádel/pickleball (césped teal, línea de cal, pelota, trofeo, tarjeta de árbitro) en vez
// del verde-fintech genérico. Ver RACKETLY_ARCHITECTURE.md / auditoría de diseño para el
// razonamiento completo de cada tono. `court` reemplaza al antiguo `primary` (mismo rol:
// acción/marca) — el alias `primary` se mantiene apuntando a `court` para no romper clases
// existentes durante el rollout por fases.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',

        // Teal petróleo — césped sintético de pádel. Acción primaria, marca, enlaces.
        court: {
          DEFAULT: '#1B6B63',
          50: '#EAF5F3',
          100: '#D2E9E5',
          200: '#A6D3CB',
          300: '#79BCB0',
          400: '#4CA495',
          500: '#2A8A7B',
          600: '#1B6B63',
          700: '#155450',
          800: '#103F3C',
          900: '#0B2B29',
        },
        // Alias de transición — Fase 2 migrará los usos de `primary-*` a `court-*` y este
        // alias se podrá retirar.
        primary: {
          DEFAULT: '#1B6B63',
          50: '#EAF5F3',
          100: '#D2E9E5',
          200: '#A6D3CB',
          300: '#79BCB0',
          400: '#4CA495',
          500: '#2A8A7B',
          600: '#1B6B63',
          700: '#155450',
          800: '#103F3C',
          900: '#0B2B29',
        },

        // Negro con matiz verde-pista — texto y superficies oscuras (sidebar, marcador).
        ink: {
          DEFAULT: '#10201C',
          50: '#EEF1F0',
          100: '#D8DEDB',
          200: '#B3BFB9',
          300: '#8A9C93',
          400: '#62786D',
          500: '#445A50',
          600: '#2E4038',
          700: '#1F2E28',
          800: '#172520',
          900: '#10201C',
        },

        // Pelota — único acento de alta energía. Solo para estado (en vivo / disponible /
        // recién confirmado), nunca decorativo.
        ball: {
          DEFAULT: '#C9E63F',
          50: '#F7FBE8',
          100: '#ECF6C4',
          300: '#DEEE8A',
          400: '#D4E962',
          500: '#C9E63F',
          600: '#A9C42C',
          700: '#839A20',
        },

        // Oro de trofeo/medalla — logros, torneos, avisos. Deliberadamente alejado de la
        // franja terracota/arcilla (ver autocrítica de la propuesta de diseño).
        trophy: {
          DEFAULT: '#C99A2E',
          50: '#FBF3E1',
          100: '#F3E1B4',
          400: '#D9AE4E',
          500: '#C99A2E',
          600: '#A87D22',
          700: '#86621A',
        },

        // Tarjeta de árbitro — errores, cancelaciones, destructivo.
        referee: {
          DEFAULT: '#C23B33',
          50: '#FBEAE9',
          100: '#F3C7C4',
          400: '#D66159',
          500: '#C23B33',
          600: '#A22F28',
          700: '#7E241F',
        },
      },
      borderRadius: { lg: '0.75rem', xl: '1rem', '2xl': '1.25rem' },
      fontFamily: {
        // IBM Plex Sans — UI y cuerpo. Más carácter y mejor legibilidad en tablas densas
        // que Inter, sin convertirse en una face de exhibición.
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        // Archivo — titulares, KPIs y todo número de marcador/estadística (con
        // `tabular-nums`). Condensada y confiada, con eco de rotulación deportiva.
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
