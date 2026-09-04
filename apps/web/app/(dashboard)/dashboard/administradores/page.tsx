'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { UserPlus, Users, Mail, Trash2, Clock, Shield, Crown, Info } from 'lucide-react'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonList } from '@/components/ui/Skeleton'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'

const GW = '' // relative — middleware inyecta Authorization header, next.config reescribe al gateway

function getCurrentUserId(): string {
  try {
    const raw = document.cookie
      .split('; ')
      .find((c) => c.startsWith('racketly_user='))
      ?.split('=')
      .slice(1)
      .join('=')
    if (!raw) return ''
    return JSON.parse(decodeURIComponent(raw))?.id ?? ''
  } catch {
    return ''
  }
}

export default function AdministradoresPage() {
  const t = useTranslations('Administradores')
  const locale = useLocale()
  const [clubId, setClubId] = useState('')
  const [clubName, setClubName] = useState('')
  const [admins, setAdmins] = useState<any[]>([])
  const [invitations, setInvitations] = useState<any[]>([])
  const [myRole, setMyRole] = useState<'owner' | 'admin' | null>(null)
  const [loading, setLoading] = useState(true)

  // Invitation form
  const [invEmail, setInvEmail] = useState('')
  const [invRole, setInvRole] = useState<'admin' | 'owner'>('admin')
  const [inviting, setInviting] = useState(false)
  const [invError, setInvError] = useState('')
  const [invSuccess, setInvSuccess] = useState('')

  const loadData = useCallback(async (cId: string) => {
    if (!cId) return
    setLoading(true)
    const myId = getCurrentUserId()

    try {
      const [clubRes, adminsRes] = await Promise.all([
        fetch(`${GW}/api/clubs/${cId}`),
        fetch(`${GW}/api/clubs/${cId}/admins`, { credentials: 'include' }),
      ])

      if (clubRes.ok) {
        const clubData = await clubRes.json()
        setClubName(clubData.data?.name || '')
      }

      if (adminsRes.ok) {
        const adminsData = await adminsRes.json()
        const list: any[] = adminsData.data ?? []
        setAdmins(list)
        const me = list.find((a) => a.userId === myId)
        setMyRole(me?.role ?? null)

        // Solo los owners cargan invitaciones
        if (me?.role === 'owner') {
          const invRes = await fetch(`${GW}/api/clubs/${cId}/invitations`, {
            credentials: 'include',
          })
          if (invRes.ok) {
            const invData = await invRes.json()
            setInvitations(invData.data ?? [])
          }
        } else {
          setInvitations([])
        }
      } else {
        setAdmins([])
        setMyRole(null)
      }
    } catch {
      setAdmins([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem('racketly_active_club') || ''
    let cId = stored
    try {
      const p = JSON.parse(stored)
      if (p?.id) cId = p.id
    } catch {
      /* plain string */
    }
    setClubId(cId)
    if (cId) loadData(cId)

    function onClubChange(e: Event) {
      const club = (e as CustomEvent).detail
      setClubId(club.id)
      setClubName(club.name)
      loadData(club.id)
    }
    window.addEventListener('club-changed', onClubChange)
    return () => window.removeEventListener('club-changed', onClubChange)
  }, [loadData])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!invEmail.trim()) return
    setInviting(true)
    setInvError('')
    setInvSuccess('')
    try {
      const res = await fetch(`${GW}/api/clubs/${clubId}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: invEmail.trim(), role: invRole }),
      })
      const data = await res.json()
      if (!res.ok) {
        setInvError(data.error || t('invite.genericError'))
        return
      }
      setInvitations((prev) => [data.data, ...prev])
      setInvEmail('')
      setInvSuccess(t('invite.successMessage', { email: invEmail.trim() }))
    } catch {
      setInvError(t('invite.connectionError'))
    } finally {
      setInviting(false)
    }
  }

  async function handleRemoveAdmin(adminId: string) {
    if (!confirm(t('removeAdminConfirm'))) return
    try {
      const res = await fetch(`${GW}/api/clubs/${clubId}/admins/${adminId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (res.ok) setAdmins((prev) => prev.filter((a) => a.id !== adminId))
    } catch {
      /* ignore */
    }
  }

  async function handleCancelInvitation(invId: string) {
    try {
      const res = await fetch(`${GW}/api/clubs/${clubId}/invitations/${invId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (res.ok) setInvitations((prev) => prev.filter((i) => i.id !== invId))
    } catch {
      /* ignore */
    }
  }

  const isOwner = myRole === 'owner'
  const myId = typeof window !== 'undefined' ? getCurrentUserId() : ''

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-bold text-ink-900">{t('pageTitle')}</h2>
        {clubName && (
          <p className="text-sm text-ink-400 mt-0.5">
            {clubName}
            {myRole && (
              <span
                className={`ml-2 inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${isOwner ? 'bg-trophy-100 text-trophy-700' : 'bg-ink-100 text-ink-600'}`}
              >
                {isOwner ? <Crown className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                {isOwner ? t('roleOwner') : t('roleAdmin')}
              </span>
            )}
          </p>
        )}
      </div>

      {/* Formulario de invitación — solo owners */}
      {isOwner && (
        <Card className="p-6">
          <h3 className="font-semibold text-ink-900 mb-1 text-sm flex items-center gap-2">
            <Mail className="w-4 h-4 text-court-600" /> {t('invite.title')}
          </h3>
          <p className="text-xs text-ink-400 mb-4">{t('invite.description')}</p>
          <form onSubmit={handleInvite} className="flex gap-3">
            <Input
              type="email"
              value={invEmail}
              onChange={(e) => setInvEmail(e.target.value)}
              placeholder={t('invite.emailPlaceholder')}
              required
              className="flex-1"
            />
            <Select
              value={invRole}
              onChange={(e) => setInvRole(e.target.value as 'admin' | 'owner')}
              className="w-auto"
            >
              <option value="admin">{t('roleAdmin')}</option>
              <option value="owner">{t('roleOwner')}</option>
            </Select>
            <Button type="submit" disabled={inviting || !clubId}>
              <UserPlus className="w-4 h-4" />
              {inviting ? t('invite.submitting') : t('invite.submit')}
            </Button>
          </form>
          {invError && <p className="text-referee-600 text-sm mt-2">{invError}</p>}
          {invSuccess && <p className="text-court-600 text-sm mt-2">{invSuccess}</p>}
        </Card>
      )}

      {/* Invitaciones pendientes — solo owners */}
      {isOwner && invitations.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>
              <Clock className="w-4 h-4 text-trophy-500 inline mr-1.5" />
              {t('pendingInvitations.title', { count: invitations.length })}
            </CardTitle>
          </CardHeader>
          <div className="divide-y divide-ink-50">
            {invitations.map((inv: any) => {
              const expired = new Date(inv.expiresAt) < new Date()
              return (
                <div key={inv.id} className="flex items-center gap-4 px-6 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-800">{inv.email}</p>
                    <p
                      className={`text-xs mt-0.5 ${expired ? 'text-referee-500' : 'text-ink-400'}`}
                    >
                      {expired
                        ? t('pendingInvitations.expired')
                        : t('pendingInvitations.expiresOn', {
                            date: new Date(inv.expiresAt).toLocaleDateString(locale),
                          })}
                    </p>
                  </div>
                  <Badge tone={inv.role === 'owner' ? 'emerald' : 'gray'}>
                    {inv.role === 'owner' ? t('roleOwner') : t('roleAdmin')}
                  </Badge>
                  <button
                    onClick={() => handleCancelInvitation(inv.id)}
                    className="text-ink-300 hover:text-referee-500 transition-colors p-1"
                    title={t('pendingInvitations.cancelTooltip')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Lista de admins */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>{t('team.title', { count: admins.length })}</CardTitle>
        </CardHeader>
        {loading ? (
          <div className="p-4">
            <SkeletonList rows={3} />
          </div>
        ) : admins.length === 0 ? (
          <EmptyState icon={Users} title={t('team.emptyTitle')} />
        ) : (
          <div className="divide-y divide-ink-50">
            {admins.map((a: any) => {
              const profile = a.user?.playerProfile
              const name = profile?.displayName || a.user?.email || '—'
              const initials = name[0].toUpperCase()
              const isMe = a.userId === myId
              const canRemove = isOwner && a.role !== 'owner'

              return (
                <div key={a.id} className="flex items-center gap-4 px-6 py-4">
                  <div className="w-10 h-10 rounded-full bg-primary-900 text-white flex items-center justify-center font-bold text-sm shrink-0">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-ink-900 text-sm">
                      {name}
                      {isMe && (
                        <span className="ml-2 text-xs text-ink-400 font-normal">
                          {t('team.you')}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-ink-400">{a.user?.email}</p>
                  </div>
                  <Badge tone={a.role === 'owner' ? 'emerald' : 'gray'}>
                    {a.role === 'owner' ? t('roleOwner') : t('roleAdmin')}
                  </Badge>
                  {canRemove && (
                    <button
                      onClick={() => handleRemoveAdmin(a.id)}
                      className="text-ink-300 hover:text-referee-500 transition-colors p-1"
                      title={t('team.removeTooltip')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Aviso para admins no-owner */}
      {myRole === 'admin' && (
        <div className="flex items-start gap-3 bg-court-50 border border-court-200 rounded-2xl p-5">
          <Info className="w-4 h-4 text-court-600 mt-0.5 shrink-0" />
          <p className="text-court-700 text-sm">
            {t.rich('adminNotice', { strong: (chunks) => <strong>{chunks}</strong> })}
          </p>
        </div>
      )}
    </div>
  )
}
