import { redirect, notFound } from 'next/navigation'
import { getSessionUser, gatewayFetch } from '@/lib/auth-web'
import { ClubBookingClient } from './ClubBookingClient'

export default async function ClubBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>
  searchParams: Promise<{ withUserId?: string; withName?: string }>
}) {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const { clubId } = await params
  const { withUserId, withName } = await searchParams

  const [clubRes, meRes] = await Promise.all([
    gatewayFetch(`/api/clubs/${clubId}`),
    gatewayFetch('/api/auth/me'),
  ])
  if (!clubRes.ok) notFound()

  const club = (await clubRes.json()).data
  const me = meRes.ok ? (await meRes.json()).data : null
  const displayName = me?.playerProfile?.displayName ?? user.email

  return (
    <ClubBookingClient
      club={club}
      userId={user.id}
      displayName={displayName}
      partnerUserId={withUserId}
      partnerName={withName}
    />
  )
}
