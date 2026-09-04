'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trophy, MapPin, Calendar, Loader2, Radio } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import type { Tournament } from '@racketly/shared-types'

type TournamentWithClub = Tournament & {
  club?: { name: string } | null
  _count?: { participants: number }
}

type Club = { id: string; name: string; city: string; address: string }

const STATUS_TABS = [
  { value: 'open', label: 'Abiertos' },
  { value: 'in_progress', label: 'En curso' },
  { value: 'completed', label: 'Finalizados' },
] as const

export function ClubTournamentsClient({ clubId }: { clubId: string }) {
  const [status, setStatus] = useState<string>('in_progress')

  const { data: club } = useQuery({
    queryKey: ['public-club', clubId],
    queryFn: async () => {
      const res = await fetch(`/api/clubs/${clubId}`, { cache: 'no-store' })
      const json = await res.json()
      return json.data as Club
    },
  })

  const { data: tournaments, isLoading } = useQuery({
    queryKey: ['public-club-tournaments', clubId, status],
    queryFn: async () => {
      const res = await fetch(`/api/tournaments?clubId=${clubId}&status=${status}&limit=50`, {
        cache: 'no-store',
      })
      const json = await res.json()
      return (json.data ?? []) as TournamentWithClub[]
    },
    refetchInterval: status === 'in_progress' ? 30_000 : false,
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-emerald-800 text-white px-5 pt-10 pb-6">
        <p className="text-emerald-300 text-xs font-semibold uppercase tracking-wide mb-1">
          Torneos del club
        </p>
        <h1 className="text-2xl font-black tracking-tight">{club?.name ?? ' '}</h1>
        {club && (
          <p className="text-emerald-200 text-sm mt-1 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" /> {club.address}, {club.city}
          </p>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-5 -mt-3">
        <Card className="p-1.5 flex gap-1">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setStatus(t.value)}
              className={`flex-1 text-sm font-semibold py-2.5 rounded-xl transition-colors ${
                status === t.value ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </Card>

        <div className="py-5 space-y-3">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
            </div>
          ) : !tournaments || tournaments.length === 0 ? (
            <EmptyState
              icon={Trophy}
              title="Sin torneos en este estado"
              description="Prueba otra pestaña para ver torneos abiertos, en curso o finalizados."
            />
          ) : (
            tournaments.map((t) => (
              <Link key={t.id} href={`/torneos/${clubId}/${t.id}`}>
                <Card className="hover:shadow-md transition-shadow">
                  <CardBody className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <Badge tone={t.sport === 'padel' ? 'emerald' : 'amber'}>{t.sport}</Badge>
                      <Badge tone="violet">{t.category}</Badge>
                      {status === 'in_progress' && (
                        <Badge tone="red" dot>
                          <Radio className="w-3 h-3" /> En vivo
                        </Badge>
                      )}
                    </div>
                    <p className="font-bold text-gray-900">{t.name}</p>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />{' '}
                        {new Date(t.startDate).toLocaleDateString('es-CO')}
                      </span>
                      <span>{t._count?.participants ?? 0} inscritos</span>
                    </div>
                  </CardBody>
                </Card>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
