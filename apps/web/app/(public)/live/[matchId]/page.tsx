import { getSessionUser } from '@/lib/auth-web'
import { LiveMatchClient } from './LiveMatchClient'

export default async function LiveMatchPage({
  params,
}: {
  params: Promise<{ matchId: string }>
}) {
  const { matchId } = await params
  const user = await getSessionUser()
  return <LiveMatchClient matchId={matchId} viewerId={user?.id ?? null} />
}
