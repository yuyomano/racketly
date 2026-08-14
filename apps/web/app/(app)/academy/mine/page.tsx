import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth-web'
import { MyCoursesClient } from './MyCoursesClient'

export default async function MyCoursesPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  return <MyCoursesClient userId={user.id} />
}
