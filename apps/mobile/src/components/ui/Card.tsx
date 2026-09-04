import React from 'react'
import { View, ViewProps, StyleSheet } from 'react-native'
import { Text } from './Text'
import { colors, radius, spacing, fontSize } from '../../theme'

export function Card({ style, children, ...props }: ViewProps) {
  return (
    <View style={[styles.card, style]} {...props}>
      {children}
    </View>
  )
}

export function CardHeader({ style, children, ...props }: ViewProps) {
  return (
    <View style={[styles.header, style]} {...props}>
      {children}
    </View>
  )
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.title}>{children}</Text>
}

export function CardBody({ style, children, ...props }: ViewProps) {
  return (
    <View style={[styles.body, style]} {...props}>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.ink100,
    padding: spacing.lg,
  },
  header: { marginBottom: spacing.sm },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  body: { gap: spacing.sm },
})
