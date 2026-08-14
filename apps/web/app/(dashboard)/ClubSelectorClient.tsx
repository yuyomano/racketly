'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Check, Plus } from 'lucide-react'
import Link from 'next/link'

export function ClubSelectorClient({ clubs: allClubs }: { clubs: any[] }) {
  const clubs = allClubs.filter((c) => c.isActive !== false)
  const [selectedId, setSelectedId] = useState<string>('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (clubs.length === 0) return
    const stored = localStorage.getItem('racketly_active_club')
    let active = clubs[0]
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        const found = clubs.find((c) => c.id === (parsed?.id ?? parsed))
        if (found) active = found
      } catch { /* ignore */ }
    }
    setSelectedId(active.id)
    localStorage.setItem('racketly_active_club', JSON.stringify(active))
    window.dispatchEvent(new CustomEvent('club-changed', { detail: active }))
  }, [clubs])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const selected = clubs.find((c) => c.id === selectedId) ?? clubs[0]

  function selectClub(club: any) {
    setSelectedId(club.id)
    localStorage.setItem('racketly_active_club', JSON.stringify(club))
    setOpen(false)
    window.dispatchEvent(new CustomEvent('club-changed', { detail: club }))
  }

  if (!selected) {
    return (
      <div className="space-y-2">
        <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
          <p className="text-primary-400 text-xs">Sin clubs asignados</p>
        </div>
        <Link
          href="/dashboard/nuevo-club"
          className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl border border-dashed border-white/20 text-white/50 hover:border-emerald-400/50 hover:text-emerald-300 transition-colors text-xs font-semibold"
        >
          <Plus className="w-3.5 h-3.5" /> Crear primer club
        </Link>
      </div>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3.5 py-3 text-left transition-colors"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-white text-sm font-bold truncate">{selected.name}</p>
            <p className="text-white/45 text-xs mt-0.5 truncate">{selected.city} · {selected.country}</p>
          </div>
          <ChevronDown className={`w-4 h-4 text-white/40 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
        {selected.adminRole && (
          <span className={`mt-2 inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
            selected.adminRole === 'owner'
              ? 'bg-emerald-500/20 text-emerald-300'
              : 'bg-white/10 text-white/60'
          }`}>
            {selected.adminRole === 'owner' ? 'Owner' : 'Admin'}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-[#0a3d2e] rounded-xl shadow-2xl border border-white/10 overflow-hidden z-50 max-h-64 overflow-y-auto">
          {clubs.map((club) => (
            <button
              key={club.id}
              onClick={() => selectClub(club)}
              className="w-full flex items-center justify-between text-left px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
            >
              <div className="min-w-0">
                <p className="text-white text-sm font-semibold truncate">{club.name}</p>
                <p className="text-white/45 text-xs truncate">{club.city} · {club.country}</p>
              </div>
              {club.id === selectedId && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
            </button>
          ))}
          <Link
            href="/dashboard/nuevo-club"
            className="flex items-center gap-2 w-full px-4 py-3 text-emerald-400 hover:bg-white/5 transition-colors text-xs font-semibold border-t border-white/10"
          >
            <Plus className="w-3.5 h-3.5" /> Crear nuevo club
          </Link>
        </div>
      )}
    </div>
  )
}
