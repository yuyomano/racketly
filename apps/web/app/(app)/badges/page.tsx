import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth-web'
import { BadgesClient } from './BadgesClient'

export default async function BadgesPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  return <BadgesClient userId={user.id} />
}
