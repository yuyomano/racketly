import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth-web'
import { ClubSearchClient } from './ClubSearchClient'

export default async function BookingPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  return <ClubSearchClient userId={user.id} />
}
