// Íconos de deporte — misma convención que el dashboard web (🎾 pádel, 🏸 pickleball)
export const SPORT_ICON: Record<string, string> = {
  padel: '🎾',
  pickleball: '🏸',
  both: '🎾',
}

export const SPORT_LABEL: Record<string, string> = {
  padel: 'Pádel',
  pickleball: 'Pickleball',
  both: 'Pádel / Pickleball',
}

export function sportIcon(sport?: string): string {
  return SPORT_ICON[sport ?? ''] ?? '🎾'
}

export function sportLabel(sport?: string): string {
  return SPORT_LABEL[sport ?? ''] ?? sport ?? ''
}
