import { redirect, notFound } from 'next/navigation'
import { getSessionUser, gatewayFetch } from '@/lib/auth-web'
import { TournamentDetailClient } from './TournamentDetailClient'

export default async function TournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const { id } = await params
  const res = await gatewayFetch(`/api/tournaments/${id}`)
  if (!res.ok) notFound()
  const tournament = (await res.json()).data

  return <TournamentDetailClient tournament={tournament} userId={user.id} />
}
