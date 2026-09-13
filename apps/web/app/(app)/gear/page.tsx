import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth-web'
import { GearClient } from './GearClient'

export default async function GearPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  return <GearClient />
}
