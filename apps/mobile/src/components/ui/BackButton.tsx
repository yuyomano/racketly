import React from 'react'
import { TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '../../theme'

export function BackButton({ onPress, light = true }: { onPress: () => void; light?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.btn} hitSlop={8}>
      <Ionicons name="arrow-back" size={22} color={light ? colors.court300 : colors.ink700} />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  btn: { padding: 4 },
})
