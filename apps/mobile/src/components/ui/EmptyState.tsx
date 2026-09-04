import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from './Text'
import { Ionicons } from '@expo/vector-icons'
import { colors, fontSize, spacing } from '../../theme'

export function EmptyState({
  icon = 'file-tray-outline',
  title,
  description,
}: {
  icon?: keyof typeof Ionicons.glyphMap
  title: string
  description?: string
}) {
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={32} color={colors.ink300} style={styles.icon} />
      <Text style={styles.title}>{title}</Text>
      {description && <Text style={styles.description}>{description}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['4xl'],
    paddingHorizontal: spacing.xl,
  },
  icon: { marginBottom: spacing.md },
  title: { fontSize: fontSize.base, fontWeight: '600', color: colors.ink700, textAlign: 'center' },
  description: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
})
