import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth-web'
import { SettingsClient } from './SettingsClient'

export default async function ProfileSettingsPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  return <SettingsClient />
}
