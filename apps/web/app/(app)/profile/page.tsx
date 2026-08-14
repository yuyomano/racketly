import { redirect } from 'next/navigation'
import { getSessionUser, gatewayFetch } from '@/lib/auth-web'
import { ProfileClient } from './ProfileClient'

export default async function ProfilePage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const res = await gatewayFetch(`/api/profile/${user.id}/stats`)
  const data = res.ok ? (await res.json()).data : null

  return <ProfileClient userId={user.id} email={user.email} initial={data} />
}
