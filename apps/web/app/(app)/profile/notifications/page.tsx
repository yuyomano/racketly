import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth-web'
import { NotificationsClient } from './NotificationsClient'

export default async function ProfileNotificationsPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  return <NotificationsClient />
}
