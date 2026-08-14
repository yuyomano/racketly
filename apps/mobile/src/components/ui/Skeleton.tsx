import React, { useEffect, useRef } from 'react'
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native'
import { colors, radius } from '../../theme'

// Bloque con pulso de opacidad — reemplaza los spinners genéricos que dejaban la
// pantalla en blanco mientras carga disponibilidad, para que el usuario vea de una
// vez la forma del contenido que está por llegar (mismo criterio que el skeleton
// de la Cuadrícula del dashboard web).
export function Skeleton({ style }: { style?: ViewStyle | ViewStyle[] }) {
  const opacity = useRef(new Animated.Value(0.4)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 650, useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [opacity])

  return <Animated.View style={[styles.block, style, { opacity }]} />
}

// Forma de la grilla horas×pistas mientras carga — sustituye al ActivityIndicator
// centrado que dejaba el resto de la pantalla vacío.
export function ScheduleGridSkeleton({ rows = 4, cols = 3 }: { rows?: number; cols?: number }) {
  return (
    <View>
      <View style={styles.headerRow}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} style={styles.headerCell} />
        ))}
      </View>
      {Array.from({ length: rows }).map((_, r) => (
        <View key={r} style={styles.gridRow}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} style={styles.gridCell} />
          ))}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  block: { backgroundColor: colors.gray200, borderRadius: radius.sm },
  headerRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  headerCell: { flex: 1, height: 16, borderRadius: radius.sm },
  gridRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  gridCell: { flex: 1, height: 44, borderRadius: radius.md },
})
