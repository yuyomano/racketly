import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from './Text'
import { colors, radius, fontSize, spacing } from '../../theme'

type Tone = 'emerald' | 'amber' | 'gray' | 'red' | 'blue' | 'violet'

const TONES: Record<Tone, { bg: string; text: string }> = {
  emerald: { bg: colors.court100, text: colors.court700 },
  amber: { bg: colors.trophy100, text: colors.trophy700 },
  gray: { bg: colors.ink100, text: colors.ink600 },
  red: { bg: colors.referee100, text: colors.referee600 },
  blue: { bg: colors.court50, text: colors.court700 },
  violet: { bg: colors.trophy50, text: colors.trophy800 },
}

export function Badge({
  tone = 'gray',
  icon,
  children,
}: {
  tone?: Tone
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  const t = TONES[tone]
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }, icon ? styles.badgeWithIcon : null]}>
      {icon}
      <Text style={[styles.text, { color: t.text }]}>{children}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  badgeWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  text: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
})
