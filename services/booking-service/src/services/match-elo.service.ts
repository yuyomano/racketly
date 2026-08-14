import { PrismaClient } from '@prisma/client'
import { calculateElo, eloToCategory } from '@racketly/utils'

const prisma = new PrismaClient()

// Aplica el ELO de un partido ya confirmado (por el rival o por aceptación tácita del cron).
// Compara el promedio de ELO de cada pareja/equipo — igual que Playtomic, el resultado solo
// afecta el nivel de los jugadores una vez que se confirma, nunca al momento de reportarlo.
export async function applyMatchElo(matchId: string): Promise<Record<string, { before: number; after: number; delta: number }> | null> {
  const match = await prisma.match.findUnique({ where: { id: matchId } })
  if (!match || match.winningSide == null) return null

  const team1Ids = [match.player1Id, match.player1PartnerId].filter(Boolean) as string[]
  const team2Ids = [match.player2Id, match.player2PartnerId].filter(Boolean) as string[]
  if (team1Ids.length === 0 || team2Ids.length === 0) return null

  const eloField = match.sport === 'pickleball' ? 'eloPickleball' : 'eloPadel'

  const [team1Profiles, team2Profiles] = await Promise.all([
    prisma.playerProfile.findMany({ where: { userId: { in: team1Ids } } }),
    prisma.playerProfile.findMany({ where: { userId: { in: team2Ids } } }),
  ])
  if (team1Profiles.length !== team1Ids.length || team2Profiles.length !== team2Ids.length) return null

  const avg1 = team1Profiles.reduce((s, p) => s + (p as any)[eloField], 0) / team1Profiles.length
  const avg2 = team2Profiles.reduce((s, p) => s + (p as any)[eloField], 0) / team2Profiles.length
  const { delta1, delta2 } = calculateElo(avg1, avg2, match.winningSide === 1)

  const eloChanges: Record<string, { before: number; after: number; delta: number }> = {}
  const updates: Promise<any>[] = []
  const historyRows: any[] = []

  for (const [profiles, delta] of [[team1Profiles, delta1], [team2Profiles, delta2]] as const) {
    for (const p of profiles) {
      const before = (p as any)[eloField]
      const after = before + delta
      updates.push(prisma.playerProfile.update({
        where: { userId: p.userId },
        data: { [eloField]: after, ...(match.sport === 'padel' ? { category: eloToCategory(after) } : {}) },
      }))
      historyRows.push({ playerId: p.userId, matchId: match.id, sport: match.sport, eloBefore: before, eloAfter: after, delta })
      eloChanges[p.userId] = { before, after, delta }
    }
  }

  await Promise.all(updates)
  await prisma.eloHistory.createMany({ data: historyRows })

  return eloChanges
}

// Cron: acepta tácitamente (y aplica ELO a) los resultados que nadie objetó dentro del plazo.
export async function autoConfirmPendingMatches(): Promise<void> {
  const now = new Date()
  const pending = await prisma.match.findMany({
    where: { bookingId: { not: null }, scoreConfirmed: false, autoConfirmAt: { lt: now } },
    select: { id: true },
  })
  if (pending.length === 0) return

  for (const m of pending) {
    await applyMatchElo(m.id)
    await prisma.match.update({
      where: { id: m.id },
      data: { scoreConfirmed: true, scoreConfirmedAt: now },
    })
  }
  console.info(`[match-confirm-cron] Auto-confirmados ${pending.length} resultados sin objeción`)
}
