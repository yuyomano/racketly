import React from 'react'
import { Text as RNText, TextProps, StyleSheet, TextStyle } from 'react-native'
import { fontFamily } from '../../theme'

type Props = TextProps & {
  // 'display' usa Archivo (títulos/marca), 'body' usa IBM Plex Sans (todo lo demás).
  variant?: 'display' | 'body'
}

// Envuelve <Text> de RN para aplicar Archivo/IBM Plex Sans según el fontWeight que
// ya trae cada estilo, en vez de tener que tocar cada StyleSheet de la app a mano.
// Fuentes cargadas vía expo-font en App.tsx — ver useFonts ahí.
export function Text({ style, variant = 'body', ...props }: Props) {
  const flat: TextStyle = StyleSheet.flatten(style) || {}
  const family =
    variant === 'display' ? pickDisplayFamily(flat.fontWeight) : pickBodyFamily(flat.fontWeight)

  // fontWeight numérico + fontFamily custom produce negrita sintética en Android;
  // ya lo resolvimos eligiendo el peso de fuente correcto, así que lo descartamos.
  const { fontWeight: _fontWeight, ...rest } = flat

  return <RNText {...props} style={[rest, { fontFamily: family }]} />
}

function weightValue(weight?: TextStyle['fontWeight']): number {
  if (weight === 'bold') return 700
  if (weight === 'normal' || !weight) return 400
  const n = Number(weight)
  return Number.isNaN(n) ? 400 : n
}

function pickDisplayFamily(weight?: TextStyle['fontWeight']): string {
  return weightValue(weight) >= 700 ? fontFamily.display : fontFamily.displaySemibold
}

function pickBodyFamily(weight?: TextStyle['fontWeight']): string {
  const w = weightValue(weight)
  if (w >= 700) return fontFamily.bodyBold
  if (w >= 600) return fontFamily.bodySemibold
  if (w >= 500) return fontFamily.bodyMedium
  return fontFamily.body
}
