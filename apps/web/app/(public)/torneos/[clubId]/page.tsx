import { ClubTournamentsClient } from './ClubTournamentsClient'

export default async function ClubTournamentsPage({
  params,
}: {
  params: Promise<{ clubId: string }>
}) {
  const { clubId } = await params
  return <ClubTournamentsClient clubId={clubId} />
}
