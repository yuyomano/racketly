import React from 'react'
import { View, Text, StyleSheet, ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BackButton } from './BackButton'
import { colors, spacing, fontSize } from '../../theme'

// ── Header estándar de pantalla ──────────────────────────────────────────────
// Reemplaza los ~12 headers duplicados que hardcodeaban `paddingTop: 60` (se ve
// mal en Android, donde la status bar mide entre 24-48px según el equipo, y no
// es exacto ni en todos los iPhone). Usa el inset real del dispositivo vía
// react-native-safe-area-context, que ya es dependencia del proyecto.
//
// Cubre los patrones que ya existían en la app:
//  - Pantalla con back: <ScreenHeader onBack={...} title="..." subtitle="..." />
//  - Pantalla raíz de tab (sin back): <ScreenHeader title="..." subtitle="..." />
//  - Hero custom (ej. avatar + badge de estado en vez de title/subtitle simples):
//    omitir `title` y armar el contenido a mano en `children` — igual se resuelve
//    el safe-area/fondo/back sin duplicar esa lógica.
// `right` acepta cualquier nodo (badge, botón, rating, etc.) para el lado derecho.
export function ScreenHeader({
  title, subtitle, onBack, right, align = 'left', backgroundColor = colors.primary900, style, children,
}: {
  title?: string
  subtitle?: string
  onBack?: () => void
  right?: React.ReactNode
  align?: 'left' | 'center'
  backgroundColor?: string
  style?: ViewStyle
  children?: React.ReactNode // contenido extra debajo de la fila de título (ej. buscador) o hero completo si no hay title
}) {
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.header, { backgroundColor, paddingTop: insets.top + spacing.md }, style]}>
      {title !== undefined && (
        <View style={styles.titleRow}>
          {onBack && <BackButton onPress={onBack} />}
          <View style={[styles.info, align === 'center' && styles.infoCentered]}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
          </View>
          {right ? <View style={styles.right}>{right}</View> : null}
        </View>
      )}
      {title === undefined && onBack && <BackButton onPress={onBack} />}
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: spacing.lg, paddingHorizontal: spacing.lg, gap: spacing.md,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  info: { flex: 1 },
  infoCentered: { alignItems: 'center' },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.white },
  subtitle: { fontSize: fontSize.sm, color: colors.primary300, marginTop: 2 },
  right: { flexShrink: 0 },
})
