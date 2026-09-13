import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth-web'
import { MyMatchRequestsClient } from './MyMatchRequestsClient'

export default async function MyMatchRequestsPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  return <MyMatchRequestsClient />
}
