export const CATEGORIES = ['C4', 'C3', 'C2', 'C1', 'B3', 'B2', 'B1', 'A', 'Open'] as const
export const TIME_PREFERENCES = ['morning', 'afternoon', 'evening', 'flexible'] as const

export type Tournament = {
  id: string
  name: string
  startDate: string
  category: string
  genderCategory: string
}

export async function fetchUpcomingPairsTournaments(): Promise<Tournament[]> {
  const res = await fetch('/api/tournaments?type=pairs&status=open&limit=100')
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Failed to load tournaments')
  return data.data ?? []
}
