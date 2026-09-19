import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth-web'
import { DetailedStatsClient } from './DetailedStatsClient'

export default async function ProfileStatsPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  return <DetailedStatsClient userId={user.id} />
}
