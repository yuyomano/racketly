import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, fontSize, radius, spacing } from '../../theme'

export function EmptyState({
  icon = 'file-tray-outline', title, description,
}: { icon?: keyof typeof Ionicons.glyphMap; title: string; description?: string }) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={26} color={colors.gray400} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {description && <Text style={styles.description}>{description}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing['4xl'], paddingHorizontal: spacing.xl },
  iconWrap: {
    width: 56, height: 56, borderRadius: radius.xl, backgroundColor: colors.gray50,
    borderWidth: 1, borderColor: colors.gray100, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
  },
  title: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray700, textAlign: 'center' },
  description: { fontSize: fontSize.sm, color: colors.gray400, marginTop: spacing.xs, textAlign: 'center' },
})
