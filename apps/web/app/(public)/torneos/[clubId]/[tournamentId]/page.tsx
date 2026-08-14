import { PublicTournamentClient } from './PublicTournamentClient'

export default async function PublicTournamentPage({
  params,
}: {
  params: Promise<{ clubId: string; tournamentId: string }>
}) {
  const { clubId, tournamentId } = await params
  return <PublicTournamentClient clubId={clubId} tournamentId={tournamentId} />
}
