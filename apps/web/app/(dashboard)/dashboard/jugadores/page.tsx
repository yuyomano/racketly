'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Search, Download, Mail, Phone, CalendarClock, Users, BadgeCheck, Wallet, SearchX, UserPlus, X, Copy, Check, Send, MapPin, Trophy, CalendarDays, ChevronRight } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/Table'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'

type PlayerRow = {
  userId: string
  name: string
  email: string | null
  phone: string | null
  bookingsCount: number
  lastBookingDate: string | null
  totalPaid: number
  membershipStatus: 'active' | 'cancelled' | 'none'
  membershipPlan: string | null
  membershipClubName: string | null
  hasActiveMembership: boolean
  hadMembershipEver: boolean
  availableCredit: number
  creditClubName: string | null
  tournamentsCount: number
  hasActivityInClub: boolean
  isProfessor: boolean
}

type PlayerBooking = {
  id: string
  date: string
  startTime: string
  endTime: string
  courtName: string
  sport: string
  clubName: string | null
  status: string
  amountPaid: number
  currency: string
  paymentStatus: string | null
  isUpcoming: boolean
}

type PlayerTournament = {
  tournamentId: string
  tournamentName: string
  sport: string
  status: string
  clubName: string | null
  location: string
  category: string
  startDate: string
  endDate: string
  partnerId: string | null
  partnerName: string | null
  paymentStatus: string
  isActive: boolean
}

type ActivityFilter = 'all' | 'engaged'
type MembershipFilter = 'all' | 'active' | 'expired' | 'none'
type CreditFilter = 'all' | 'with_credit'

function csvEscape(v: string | number) {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export default function JugadoresPage() {
  const t = useTranslations('Jugadores')
  const [clubId, setClubId] = useState<string | null>(null)
  const [clubCurrency, setClubCurrency] = useState('USD')
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all')
  const [membershipFilter, setMembershipFilter] = useState<MembershipFilter>('all')
  const [creditFilter, setCreditFilter] = useState<CreditFilter>('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [selectedPlayer, setSelectedPlayer] = useState<PlayerRow | null>(null)
  const [detailBookings, setDetailBookings] = useState<PlayerBooking[]>([])
  const [detailTournaments, setDetailTournaments] = useState<PlayerTournament[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createEmail, setCreateEmail] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createResult, setCreateResult] = useState<{ link: string; email: string } | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)

  const fetchPlayers = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/clubs/${id}/players`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error || t('errorCargarJugadores'))
      setPlayers(json.data ?? [])
      setClubCurrency(json.currency ?? 'USD')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem('racketly_active_club')
    if (stored) {
      try { const p = JSON.parse(stored); if (p?.id) { setClubId(p.id); fetchPlayers(p.id) } }
      catch { setLoading(false) }
    } else { setLoading(false) }

    function onClubChanged(e: Event) {
      const detail = (e as CustomEvent).detail
      if (detail?.id) { setClubId(detail.id); fetchPlayers(detail.id) }
    }
    window.addEventListener('club-changed', onClubChanged)
    return () => window.removeEventListener('club-changed', onClubChanged)
  }, [fetchPlayers])

  const filtered = useMemo(() => {
    return players.filter((p) => {
      if (activityFilter === 'engaged' && !p.hasActivityInClub) return false
      if (membershipFilter === 'active' && !p.hasActiveMembership) return false
      if (membershipFilter === 'expired' && !(p.hadMembershipEver && !p.hasActiveMembership)) return false
      if (membershipFilter === 'none' && p.hadMembershipEver) return false
      if (creditFilter === 'with_credit' && !(p.availableCredit > 0)) return false
      if (query.trim()) {
        const q = query.trim().toLowerCase()
        if (!p.name.toLowerCase().includes(q) && !(p.email ?? '').toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [players, activityFilter, membershipFilter, creditFilter, query])

  const stats = useMemo(() => ({
    engaged: players.filter((p) => p.hasActivityInClub).length,
    activeMembership: players.filter((p) => p.hasActiveMembership).length,
    withCredit: players.filter((p) => p.availableCredit > 0).length,
  }), [players])

  function toggleSelected(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId); else next.add(userId)
      return next
    })
  }

  function toggleSelectAll() {
    setSelected((prev) => prev.size === filtered.length ? new Set() : new Set(filtered.map((p) => p.userId)))
  }

  function exportCsv() {
    const rows = selected.size > 0 ? filtered.filter((p) => selected.has(p.userId)) : filtered
    const header = [
      t('csvHeaderNombre'), t('csvHeaderEmail'), t('csvHeaderTelefono'), t('csvHeaderReservas'),
      t('csvHeaderUltimaReserva'), t('csvHeaderTotalPagado'), t('csvHeaderMembresia'), t('csvHeaderPlan'),
      t('csvHeaderCreditoDisponible'), t('csvHeaderTorneos'), t('csvHeaderConMovimiento'),
    ]
    const lines = rows.map((p) => [
      p.name, p.email ?? '', p.phone ?? '', p.bookingsCount, p.lastBookingDate ?? '',
      p.totalPaid, p.hasActiveMembership ? t('csvActiva') : p.hadMembershipEver ? t('csvVencida') : t('csvSinMembresia'),
      p.membershipPlan ?? '', p.availableCredit, p.tournamentsCount, p.hasActivityInClub ? t('csvSi') : t('csvNo'),
    ].map(csvEscape).join(','))
    const csv = [header.join(','), ...lines].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `jugadores_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function openPlayerDetail(player: PlayerRow) {
    if (!clubId) return
    setSelectedPlayer(player)
    setDetailLoading(true)
    setDetailError(null)
    setDetailBookings([])
    setDetailTournaments([])
    try {
      const [bookingsRes, tournamentsRes] = await Promise.all([
        fetch(`/api/clubs/${clubId}/players/${player.userId}/bookings`),
        fetch(`/api/tournaments/participants/user/${player.userId}`),
      ])
      const bookingsJson = await bookingsRes.json()
      const tournamentsJson = await tournamentsRes.json()
      if (bookingsJson.success) setDetailBookings(bookingsJson.data ?? [])
      if (tournamentsJson.success) setDetailTournaments(tournamentsJson.data ?? [])
      if (!bookingsJson.success && !tournamentsJson.success) {
        setDetailError(t('errorCargarDetalle'))
      }
    } catch (e: any) {
      setDetailError(e.message)
    } finally {
      setDetailLoading(false)
    }
  }

  function openCreateModal() {
    setCreateName('')
    setCreateEmail('')
    setCreateError(null)
    setCreateResult(null)
    setLinkCopied(false)
    setShowCreate(true)
  }

  async function handleCreatePlayer() {
    if (!createName.trim()) { setCreateError(t('errorNombreRequerido')); return }
    if (!createEmail.trim()) { setCreateError(t('errorEmailRequerido')); return }
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/auth/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: createName.trim(), email: createEmail.trim(), invitedBy: 'dashboard' }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || t('errorCrearJugador'))
      setCreateResult({ link: json.data.invite.link, email: json.data.user.email })
    } catch (e: any) {
      setCreateError(e.message)
    } finally {
      setCreating(false)
    }
  }

  function copyInviteLink() {
    if (!createResult) return
    navigator.clipboard.writeText(createResult.link)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">{t('pageTitle')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('pageSubtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openCreateModal}
            disabled={!clubId}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            {t('crearJugador')}
          </button>
          <button
            onClick={exportCsv}
            disabled={!clubId || filtered.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-4 h-4" />
            {t('exportarCsv', { count: selected.size > 0 ? selected.size : filtered.length })}
          </button>
        </div>
      </div>

      {clubId && (
        <div className="grid grid-cols-3 gap-4">
          <StatCard label={t('statConMovimiento')} value={String(stats.engaged)} icon={Users} tone="gray" active={activityFilter === 'engaged'} onClick={() => setActivityFilter((v) => v === 'engaged' ? 'all' : 'engaged')} />
          <StatCard label={t('statConMembresiaActiva')} value={String(stats.activeMembership)} icon={BadgeCheck} tone="emerald" active={membershipFilter === 'active'} onClick={() => setMembershipFilter((v) => v === 'active' ? 'all' : 'active')} />
          <StatCard label={t('statConCredito')} value={String(stats.withCredit)} icon={Wallet} tone="amber" active={creditFilter === 'with_credit'} onClick={() => setCreditFilter((v) => v === 'with_credit' ? 'all' : 'with_credit')} />
        </div>
      )}

      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('buscarPlaceholder')}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 mb-1">{t('filtroClubActivo')}</label>
              <Select
                value={activityFilter}
                onChange={(e) => setActivityFilter(e.target.value as ActivityFilter)}
                className="rounded-lg text-xs font-semibold text-gray-600 px-2.5 py-1.5"
              >
                <option value="all">{t('filtroTodos')}</option>
                <option value="engaged">{t('filtroConMovimientoEnElClub')}</option>
              </Select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 mb-1">{t('filtroMembresia')}</label>
              <Select
                value={membershipFilter}
                onChange={(e) => setMembershipFilter(e.target.value as MembershipFilter)}
                className="rounded-lg text-xs font-semibold text-gray-600 px-2.5 py-1.5"
              >
                <option value="all">{t('filtroTodos')}</option>
                <option value="active">{t('filtroActiva')}</option>
                <option value="expired">{t('filtroVencida')}</option>
                <option value="none">{t('filtroSinMembresia')}</option>
              </Select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 mb-1">{t('filtroConCreditoDisponible')}</label>
              <Select
                value={creditFilter}
                onChange={(e) => setCreditFilter(e.target.value as CreditFilter)}
                className="rounded-lg text-xs font-semibold text-gray-600 px-2.5 py-1.5"
              >
                <option value="all">{t('filtroTodos')}</option>
                <option value="with_credit">{t('filtroConCredito')}</option>
              </Select>
            </div>
          </div>
        </div>
      </Card>

      {!clubId ? (
        <EmptyState icon={Users} title={t('emptyNoClubTitle')} description={t('emptyNoClubDescription')} />
      ) : loading ? (
        <Card className="p-6"><SkeletonTable rows={7} cols={7} /></Card>
      ) : error ? (
        <Card className="p-6 text-center text-sm text-red-500">{error}</Card>
      ) : filtered.length === 0 ? (
        <EmptyState icon={SearchX} title={t('emptyNoResultsTitle')} description={t('emptyNoResultsDescription')} />
      ) : (
        <Card className="overflow-x-auto">
          <Table>
            <TableHead>
              <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">
                <Th className="w-8">
                  <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} />
                </Th>
                <Th>{t('tableJugador')}</Th>
                <Th>{t('tableContacto')}</Th>
                <Th>{t('tableReservas')}</Th>
                <Th>{t('tableUltimaReserva')}</Th>
                <Th>{t('tableTotalPagado')}</Th>
                <Th>{t('tableMembresia')}</Th>
                <Th>{t('tableCredito')}</Th>
                <Th>{t('tableTorneos')}</Th>
              </tr>
            </TableHead>
            <TableBody>
              {filtered.map((p) => (
                <TableRow
                  key={p.userId}
                  onClick={() => openPlayerDetail(p)}
                  className={`cursor-pointer ${
                    selectedPlayer?.userId === p.userId
                      ? 'bg-emerald-50 hover:bg-emerald-50'
                      : 'hover:bg-gray-50/60'
                  }`}
                >
                  <Td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(p.userId)} onChange={() => toggleSelected(p.userId)} />
                  </Td>
                  <Td className="font-semibold text-gray-800">
                    <span className="flex items-center gap-1.5 flex-wrap">
                      <span className="truncate max-w-[220px]">{p.name}</span>
                      {p.isProfessor && <Badge tone="violet">{t('badgeProfesor')}</Badge>}
                      <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                    </span>
                  </Td>
                  <Td className="text-gray-500">
                    <div className="flex flex-col gap-0.5">
                      {p.email && <span className="flex items-center gap-1 text-xs"><Mail className="w-3 h-3" />{p.email}</span>}
                      {p.phone && <span className="flex items-center gap-1 text-xs"><Phone className="w-3 h-3" />{p.phone}</span>}
                    </div>
                  </Td>
                  <Td className="text-gray-600">{p.bookingsCount}</Td>
                  <Td className="text-gray-500 text-xs">
                    {p.lastBookingDate ? <span className="flex items-center gap-1"><CalendarClock className="w-3 h-3" />{p.lastBookingDate}</span> : '—'}
                  </Td>
                  <Td className="text-gray-600">{formatCurrency(p.totalPaid, clubCurrency)}</Td>
                  <Td>
                    {p.hasActiveMembership ? (
                      <div className="flex flex-col gap-0.5">
                        <Badge tone="emerald">{p.membershipPlan ?? t('badgeActiva')}</Badge>
                        {p.membershipClubName && <span className="text-[11px] text-gray-400">{p.membershipClubName}</span>}
                      </div>
                    ) : p.hadMembershipEver ? (
                      <div className="flex flex-col gap-0.5">
                        <Badge tone="amber">{t('badgeVencida')}</Badge>
                        {p.membershipClubName && <span className="text-[11px] text-gray-400">{p.membershipClubName}</span>}
                      </div>
                    ) : (
                      <Badge tone="gray">{t('badgeSinMembresia')}</Badge>
                    )}
                  </Td>
                  <Td className="text-gray-600">
                    {p.availableCredit > 0 ? (
                      <div className="flex flex-col gap-0.5">
                        <span>{formatCurrency(p.availableCredit, clubCurrency)}</span>
                        {p.creditClubName && <span className="text-[11px] text-gray-400">{p.creditClubName}</span>}
                      </div>
                    ) : '—'}
                  </Td>
                  <Td className="text-gray-600">{p.tournamentsCount > 0 ? p.tournamentsCount : '—'}</Td>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title={createResult ? t('modalInvitacionCreadaTitle') : t('modalCrearJugadorTitle')}
        maxWidth="md"
      >
        {createResult ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              {t.rich('invitacionCreadaTexto', {
                email: createResult.email,
                b: (chunks) => <span className="font-semibold text-gray-700">{chunks}</span>,
              })}
            </p>
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
              <span className="text-xs text-gray-600 truncate flex-1">{createResult.link}</span>
              <button
                onClick={copyInviteLink}
                className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 shrink-0"
              >
                {linkCopied ? <><Check className="w-3.5 h-3.5" />{t('copiado')}</> : <><Copy className="w-3.5 h-3.5" />{t('copiar')}</>}
              </button>
            </div>
            <p className="text-xs text-gray-400">{t('linkExpiraTexto')}</p>
            <button
              onClick={() => setShowCreate(false)}
              className="w-full py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors"
            >
              {t('listo')}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t('nombreCompletoLabel')}</label>
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder={t('nombrePlaceholder')}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t('emailLabel')}</label>
              <Input
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                placeholder={t('emailPlaceholder')}
                type="email"
              />
            </div>
            {createError && <p className="text-xs text-red-500">{createError}</p>}
            <button
              onClick={handleCreatePlayer}
              disabled={creating}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50 transition-colors"
            >
              <Send className="w-4 h-4" />
              {creating ? t('creando') : t('crearYEnviarInvitacion')}
            </button>
          </div>
        )}
      </Modal>

      {selectedPlayer && (
        <div className="fixed top-0 right-0 h-full w-full max-w-lg bg-white border-l border-gray-200 shadow-2xl overflow-y-auto z-50">
          <div>
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{selectedPlayer.name}</h2>
                <div className="flex flex-col gap-0.5 mt-0.5">
                  {selectedPlayer.email && <span className="flex items-center gap-1 text-xs text-gray-400"><Mail className="w-3 h-3" />{selectedPlayer.email}</span>}
                  {selectedPlayer.phone && <span className="flex items-center gap-1 text-xs text-gray-400"><Phone className="w-3 h-3" />{selectedPlayer.phone}</span>}
                </div>
              </div>
              <button onClick={() => setSelectedPlayer(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {detailLoading ? (
                <p className="text-sm text-gray-400 text-center py-8">{t('cargandoDetalle')}</p>
              ) : detailError ? (
                <p className="text-sm text-red-500 text-center py-8">{detailError}</p>
              ) : (
                <>
                  <section>
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <CalendarDays className="w-3.5 h-3.5" />
                      {t('reservasActivas')}
                    </h3>
                    {detailBookings.filter((b) => b.isUpcoming).length === 0 ? (
                      <p className="text-sm text-gray-400">{t('sinReservasActivas')}</p>
                    ) : (
                      <div className="space-y-2">
                        {detailBookings.filter((b) => b.isUpcoming).map((b) => (
                          <div key={b.id} className="flex items-center justify-between bg-emerald-50/60 border border-emerald-100 rounded-xl px-3 py-2.5">
                            <div>
                              <p className="text-sm font-semibold text-gray-800">{b.courtName} · {b.sport}</p>
                              <p className="text-xs text-gray-500">{b.date} · {b.startTime}–{b.endTime}</p>
                              {b.clubName && <p className="text-[11px] text-gray-400 mt-0.5">{b.clubName}</p>}
                            </div>
                            <Badge tone={b.status === 'confirmed' ? 'emerald' : 'amber'}>{b.status}</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section>
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <CalendarClock className="w-3.5 h-3.5" />
                      {t('historialDeReservas')}
                    </h3>
                    {detailBookings.filter((b) => !b.isUpcoming).length === 0 ? (
                      <p className="text-sm text-gray-400">{t('sinReservasPasadas')}</p>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {detailBookings.filter((b) => !b.isUpcoming).map((b) => (
                          <div key={b.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
                            <div>
                              <p className="text-sm font-medium text-gray-700">{b.courtName} · {b.sport}</p>
                              <p className="text-xs text-gray-500">{b.date} · {b.startTime}–{b.endTime}</p>
                              {b.clubName && <p className="text-[11px] text-gray-400 mt-0.5">{b.clubName}</p>}
                            </div>
                            <span className="text-xs text-gray-400">{formatCurrency(b.amountPaid, b.currency)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section>
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <Trophy className="w-3.5 h-3.5" />
                      {t('torneosActivosInscritos')}
                    </h3>
                    {detailTournaments.filter((tr) => tr.isActive).length === 0 ? (
                      <p className="text-sm text-gray-400">{t('sinTorneosActivos')}</p>
                    ) : (
                      <div className="space-y-2">
                        {detailTournaments.filter((tr) => tr.isActive).map((tr) => (
                          <div key={tr.tournamentId} className="bg-violet-50/60 border border-violet-100 rounded-xl px-3 py-2.5">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-semibold text-gray-800">{tr.tournamentName}</p>
                              <Badge tone="violet">{tr.status}</Badge>
                            </div>
                            <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3" />{tr.location}
                            </p>
                            {tr.clubName && <p className="text-[11px] text-gray-400 mt-0.5">{tr.clubName}</p>}
                            <p className="text-xs text-gray-500 mt-0.5">
                              {t('parejaLabel', { partner: tr.partnerName ?? t('sinConfirmar') })}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section>
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <Trophy className="w-3.5 h-3.5" />
                      {t('historialDeTorneos')}
                    </h3>
                    {detailTournaments.filter((tr) => !tr.isActive).length === 0 ? (
                      <p className="text-sm text-gray-400">{t('sinTorneosAnteriores')}</p>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {detailTournaments.filter((tr) => !tr.isActive).map((tr) => (
                          <div key={tr.tournamentId} className="bg-gray-50 rounded-xl px-3 py-2.5">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium text-gray-700">{tr.tournamentName}</p>
                              <Badge tone="gray">{tr.status}</Badge>
                            </div>
                            <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3" />{tr.location}
                            </p>
                            {tr.clubName && <p className="text-[11px] text-gray-400 mt-0.5">{tr.clubName}</p>}
                            <p className="text-xs text-gray-500 mt-0.5">
                              {t('parejaLabel', { partner: tr.partnerName ?? t('sinConfirmar') })}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

