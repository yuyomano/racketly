import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth-web'
import { FindPartnerClient } from './FindPartnerClient'

export default async function FindPartnerPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  return <FindPartnerClient userId={user.id} />
}
