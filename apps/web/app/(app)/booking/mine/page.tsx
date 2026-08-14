import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth-web'
import { MyBookingsClient } from './MyBookingsClient'

export default async function MyBookingsPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  return <MyBookingsClient />
}
