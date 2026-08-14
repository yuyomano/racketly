import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { colors, radius, fontSize, spacing } from '../../theme'

type Tone = 'emerald' | 'amber' | 'gray' | 'red' | 'blue' | 'violet'

const TONES: Record<Tone, { bg: string; text: string }> = {
  emerald: { bg: colors.primary100, text: colors.primary700 },
  amber:   { bg: colors.amber100,   text: colors.amber700 },
  gray:    { bg: colors.gray100,    text: colors.gray600 },
  red:     { bg: colors.red100,     text: colors.red600 },
  blue:    { bg: colors.blue50,     text: colors.blue600 },
  violet:  { bg: colors.violet50,   text: colors.violet700 },
}

export function Badge({ tone = 'gray', icon, children }: { tone?: Tone; icon?: React.ReactNode; children: React.ReactNode }) {
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
