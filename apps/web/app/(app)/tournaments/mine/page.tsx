import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth-web'
import { MyTournamentsClient } from './MyTournamentsClient'

export default async function MyTournamentsPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  return <MyTournamentsClient userId={user.id} />
}
