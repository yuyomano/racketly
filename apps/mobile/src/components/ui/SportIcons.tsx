// Íconos de deporte — mismo diseño que el dashboard web (raqueta de pádel / pala de pickleball)
import Svg, { Rect, Circle } from 'react-native-svg'

type IconProps = { size?: number; color?: string }

export function PadelIcon({ size = 24, color = '#111827' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill={color}>
      {/* Cabeza — rectángulo redondeado, como una pala de pádel real */}
      <Rect x={2} y={1} width={20} height={16} rx={5} ry={5} />
      {/* Grilla de agujeros 3×3 */}
      <Circle cx={7.5} cy={5.5} r={1.4} fill="white" />
      <Circle cx={12} cy={5.5} r={1.4} fill="white" />
      <Circle cx={16.5} cy={5.5} r={1.4} fill="white" />
      <Circle cx={7.5} cy={9} r={1.4} fill="white" />
      <Circle cx={12} cy={9} r={1.4} fill="white" />
      <Circle cx={16.5} cy={9} r={1.4} fill="white" />
      <Circle cx={7.5} cy={12.5} r={1.4} fill="white" />
      <Circle cx={12} cy={12.5} r={1.4} fill="white" />
      <Circle cx={16.5} cy={12.5} r={1.4} fill="white" />
      {/* Mango */}
      <Rect x={10} y={17} width={4} height={6} rx={2} />
    </Svg>
  )
}

export function PickleballIcon({ size = 24, color = '#111827' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill={color}>
      {/* Cabeza — círculo, como una pala de pickleball real */}
      <Circle cx={12} cy={9} r={8} />
      {/* Perforaciones 3×3 */}
      <Circle cx={8.5} cy={6} r={1.3} fill="white" />
      <Circle cx={12} cy={6} r={1.3} fill="white" />
      <Circle cx={15.5} cy={6} r={1.3} fill="white" />
      <Circle cx={8.5} cy={9.5} r={1.3} fill="white" />
      <Circle cx={12} cy={9.5} r={1.3} fill="white" />
      <Circle cx={15.5} cy={9.5} r={1.3} fill="white" />
      <Circle cx={8.5} cy={13} r={1.3} fill="white" />
      <Circle cx={12} cy={13} r={1.3} fill="white" />
      <Circle cx={15.5} cy={13} r={1.3} fill="white" />
      {/* Mango */}
      <Rect x={10} y={17} width={4} height={7} rx={2} />
    </Svg>
  )
}

export function SportIcon({
  sport,
  size = 16,
  color,
}: {
  sport?: string
  size?: number
  color?: string
}) {
  return sport === 'padel' ? (
    <PadelIcon size={size} color={color} />
  ) : (
    <PickleballIcon size={size} color={color} />
  )
}
