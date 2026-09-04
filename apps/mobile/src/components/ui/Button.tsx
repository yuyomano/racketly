import React from 'react'
import { TouchableOpacity, ActivityIndicator, StyleSheet, ViewStyle } from 'react-native'
import { Text } from './Text'
import { colors, radius, fontSize, spacing } from '../../theme'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'live'
type Size = 'sm' | 'md'

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  onPress,
  children,
  style,
}: {
  variant?: Variant
  size?: Size
  loading?: boolean
  disabled?: boolean
  onPress?: () => void
  children: React.ReactNode
  style?: ViewStyle
}) {
  const isDisabled = disabled || loading
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      style={[
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        VARIANT_STYLES[variant],
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={TEXT_STYLES[variant].color} size="small" />
      ) : (
        <Text
          style={[styles.text, TEXT_STYLES[variant], size === 'sm' && { fontSize: fontSize.sm }]}
        >
          {children}
        </Text>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  sm: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  md: { paddingVertical: spacing.md + 2, paddingHorizontal: spacing.xl },
  disabled: { opacity: 0.55 },
  text: { fontWeight: '700', fontSize: fontSize.base },
})

const VARIANT_STYLES: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: colors.court600 },
  secondary: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.ink200 },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.referee50 },
  live: { backgroundColor: colors.ball500 },
}

const TEXT_STYLES: Record<Variant, { color: string }> = {
  primary: { color: colors.white },
  secondary: { color: colors.ink700 },
  ghost: { color: colors.ink600 },
  danger: { color: colors.referee600 },
  live: { color: colors.ink900 },
}
