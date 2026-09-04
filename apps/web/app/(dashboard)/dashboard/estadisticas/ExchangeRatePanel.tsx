'use client'

import { useEffect, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Card } from '@/components/ui/Card'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/Table'
import { RefreshCw, Save, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

interface Rate {
  id: string
  from: string
  to: string
  rate: number
  source: string
  updatedAt: string
}

export function ExchangeRatePanel() {
  const t = useTranslations('Estadisticas')
  const locale = useLocale()
  const [rates, setRates] = useState<Rate[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  // Manual edit buffer: from → new rate string
  const [edits, setEdits] = useState<Record<string, string>>({})

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/exchange-rates')
      const d = await r.json()
      if (d.success) setRates(d.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSync() {
    setSyncing(true)
    try {
      const r = await fetch('/api/exchange-rates/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const d = await r.json()
      if (d.success) {
        showToast(t('toastSyncSuccess', { count: d.synced, date: d.date }), true)
        await load()
      } else {
        showToast(d.error ?? t('toastSyncError'), false)
      }
    } catch {
      showToast(t('toastConnError'), false)
    } finally {
      setSyncing(false)
    }
  }

  async function handleSave(from: string) {
    const raw = edits[from]
    if (!raw) return
    const rate = parseFloat(raw)
    if (isNaN(rate) || rate <= 0) {
      showToast(t('toastInvalidRate'), false)
      return
    }

    setSaving(from)
    try {
      const r = await fetch('/api/exchange-rates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: 'USD', rate }),
      })
      const d = await r.json()
      if (d.success) {
        showToast(t('toastSaveSuccess', { from }), true)
        setEdits((e) => {
          const n = { ...e }
          delete n[from]
          return n
        })
        await load()
      } else {
        showToast(d.error ?? t('toastSaveError'), false)
      }
    } catch {
      showToast(t('toastConnError'), false)
    } finally {
      setSaving(null)
    }
  }

  const fmt = (rate: number) => {
    if (rate < 0.001) return rate.toFixed(8)
    if (rate < 0.1) return rate.toFixed(6)
    return rate.toFixed(4)
  }

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  return (
    <Card className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-bold text-ink-800">{t('exchangeRateTitle')}</h3>
          <p className="text-xs text-ink-400 mt-0.5">{t('exchangeRateSubtitle')}</p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-court-50 text-court-700 border border-court-200 hover:bg-court-100 disabled:opacity-50 transition-colors"
        >
          {syncing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          {syncing ? t('syncingButton') : t('syncButton')}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg mb-4 ${toast.ok ? 'bg-court-50 text-court-700' : 'bg-referee-50 text-referee-700'}`}
        >
          {toast.ok ? (
            <CheckCircle className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          )}
          {toast.msg}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-10 text-ink-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> {t('loadingRates')}
        </div>
      ) : rates.length === 0 ? (
        <div className="text-center py-10 text-xs text-ink-400">{t('noRates')}</div>
      ) : (
        <div className="overflow-x-auto">
          <Table className="text-xs">
            <TableHead className="normal-case bg-transparent">
              <tr className="border-b border-ink-100">
                <Th className="text-left font-semibold text-ink-500 pb-2 pr-4 px-0 py-0">
                  {t('colCurrency')}
                </Th>
                <Th className="text-right font-semibold text-ink-500 pb-2 pr-4 px-0 py-0">
                  {t('colRate')}
                </Th>
                <Th className="text-right font-semibold text-ink-500 pb-2 pr-4 px-0 py-0">
                  {t('colSource')}
                </Th>
                <Th className="text-right font-semibold text-ink-500 pb-2 pr-4 px-0 py-0">
                  {t('colUpdated')}
                </Th>
                <Th className="text-right font-semibold text-ink-500 pb-2 px-0 py-0">
                  {t('colManual')}
                </Th>
              </tr>
            </TableHead>
            <TableBody className="divide-y divide-ink-50">
              {rates.map((r) => {
                const editing = edits[r.from] !== undefined
                return (
                  <TableRow key={r.id}>
                    <Td className="py-2 pr-4 px-0 font-mono font-bold text-ink-800">{r.from}</Td>
                    <Td className="py-2 pr-4 px-0 text-right font-mono text-ink-700">
                      {fmt(r.rate)}
                    </Td>
                    <Td className="py-2 pr-4 px-0 text-right">
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          r.source === 'frankfurter'
                            ? 'bg-court-50 text-court-600'
                            : r.source === 'fallback'
                              ? 'bg-trophy-50 text-trophy-600'
                              : 'bg-trophy-50 text-trophy-600'
                        }`}
                      >
                        {r.source === 'frankfurter'
                          ? t('sourceEcb')
                          : r.source === 'fallback'
                            ? t('sourceApprox')
                            : t('sourceManual')}
                      </span>
                    </Td>
                    <Td className="py-2 pr-4 px-0 text-right text-ink-400">
                      {fmtDate(r.updatedAt)}
                    </Td>
                    <Td className="py-2 px-0 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          placeholder={fmt(r.rate)}
                          value={edits[r.from] ?? ''}
                          onChange={(e) =>
                            setEdits((prev) => ({ ...prev, [r.from]: e.target.value }))
                          }
                          className="w-24 border border-ink-200 rounded px-1.5 py-0.5 font-mono text-right text-xs focus:outline-none focus:ring-1 focus:ring-court-400"
                        />
                        <button
                          onClick={() => handleSave(r.from)}
                          disabled={!editing || saving === r.from}
                          className="p-1 rounded text-court-600 hover:bg-court-50 disabled:opacity-30 transition-colors"
                          title={t('saveButtonTitle')}
                        >
                          {saving === r.from ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Save className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </Td>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-[10px] text-ink-300 mt-4">{t('footerNote')}</p>
    </Card>
  )
}
