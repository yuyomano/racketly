import { PrismaClient } from '@prisma/client'
import {
  knockoutStageKeyForRound,
  resolveMatchFormat,
  type MatchFormat,
  type MatchFormatOverrides,
} from '@racketly/utils'

// Modalidad efectiva de un partido: si pertenece a un torneo, sale de
// `Tournament.matchFormat`/`matchFormatOverrides` según la ronda; los partidos
// casuales (sin torneo) siempre juegan a 3 sets completos.
export async function resolveFormatForMatch(
  prisma: PrismaClient,
  match: { tournamentId: string | null; stage: string; round: number | null }
): Promise<MatchFormat> {
  if (!match.tournamentId) return 'best_of_3_full'

  const tournament = await prisma.tournament.findUnique({
    where: { id: match.tournamentId },
    select: { matchFormat: true, matchFormatOverrides: true },
  })
  if (!tournament) return 'best_of_3_full'

  const maxRoundAgg =
    match.stage === 'knockout'
      ? await prisma.match.aggregate({
          where: { tournamentId: match.tournamentId, stage: 'knockout' },
          _max: { round: true },
        })
      : null

  const stageKey =
    match.stage === 'knockout' && match.round !== null && maxRoundAgg
      ? knockoutStageKeyForRound(match.round, maxRoundAgg._max.round ?? 0)
      : null

  return resolveMatchFormat(
    {
      matchFormat: tournament.matchFormat,
      matchFormatOverrides: (tournament.matchFormatOverrides as MatchFormatOverrides | null) ?? null,
    },
    stageKey
  )
}
