import { normalizeSetScore } from '@racketly/utils'

export type GroupStanding = {
  playerId: string
  groupNumber: number
  played: number
  won: number
  lost: number
  setsWon: number
  setsLost: number
  gamesWon: number
  gamesLost: number
  points: number
}

export function computeGroupStandings(
  matches: {
    player1Id: string | null
    player2Id: string | null
    winnerId: string | null
    status: string
    score: unknown
  }[],
  groupPlayerIds: string[],
  groupNumber = 0
): GroupStanding[] {
  const map = new Map<string, GroupStanding>()
  for (const id of groupPlayerIds) {
    map.set(id, {
      playerId: id,
      groupNumber,
      played: 0,
      won: 0,
      lost: 0,
      setsWon: 0,
      setsLost: 0,
      gamesWon: 0,
      gamesLost: 0,
      points: 0,
    })
  }

  for (const m of matches) {
    if (m.status !== 'completed' && m.status !== 'walkover') continue
    if (!m.player1Id || !m.player2Id) continue
    const s1 = map.get(m.player1Id)
    const s2 = map.get(m.player2Id)
    if (!s1 || !s2) continue

    s1.played++
    s2.played++

    const sets = Array.isArray(m.score) ? m.score.map(normalizeSetScore) : []
    let setsW1 = 0,
      setsW2 = 0,
      g1 = 0,
      g2 = 0
    for (const set of sets) {
      g1 += set.p1
      g2 += set.p2
      if (set.p1 > set.p2) setsW1++
      else if (set.p2 > set.p1) setsW2++
    }
    s1.setsWon += setsW1
    s1.setsLost += setsW2
    s1.gamesWon += g1
    s1.gamesLost += g2
    s2.setsWon += setsW2
    s2.setsLost += setsW1
    s2.gamesWon += g2
    s2.gamesLost += g1

    if (m.winnerId === m.player1Id) {
      s1.won++
      s1.points += 3
      s2.lost++
    } else if (m.winnerId === m.player2Id) {
      s2.won++
      s2.points += 3
      s1.lost++
    }
  }

  return [...map.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.setsWon - b.setsLost - (a.setsWon - a.setsLost) ||
      b.gamesWon - b.gamesLost - (a.gamesWon - a.gamesLost)
  )
}
