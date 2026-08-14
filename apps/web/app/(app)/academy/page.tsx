import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth-web'
import { AcademyClient } from './AcademyClient'

export default async function AcademyPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  return <AcademyClient userId={user.id} />
}
