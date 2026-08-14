import React from 'react'
import { View, ViewProps, StyleSheet } from 'react-native'
import { colors, radius, shadow, spacing } from '../../theme'

export function Card({ style, children, ...props }: ViewProps) {
  return (
    <View style={[styles.card, style]} {...props}>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.sm,
  },
})
