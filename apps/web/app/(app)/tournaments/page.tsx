import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth-web'
import { TournamentSearchClient } from './TournamentSearchClient'

export default async function TournamentsPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  return <TournamentSearchClient userId={user.id} />
}
