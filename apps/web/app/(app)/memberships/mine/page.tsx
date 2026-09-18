import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth-web'
import { MyMembershipsClient } from './MyMembershipsClient'

export default async function MyMembershipsPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  return <MyMembershipsClient userId={user.id} />
}
