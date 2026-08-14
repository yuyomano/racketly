import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth-web'
import { CommunityFeedClient } from './CommunityFeedClient'

export default async function CommunityPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  return (
    <div className="max-w-2xl mx-auto">
      <CommunityFeedClient userId={user.id} />
    </div>
  )
}
