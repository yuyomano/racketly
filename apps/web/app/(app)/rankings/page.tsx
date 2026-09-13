import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth-web'
import { RankingsClient } from './RankingsClient'

export default async function RankingsPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  return <RankingsClient userId={user.id} />
}
