'use client'

import { useState, useEffect, useMemo } from 'react'
import type { SpreadPoint, WindowKey, TradingRules, TradeTranche } from '@/types'
import { WINDOW_MONTHS } from '@/types'
import { subtractMonths, computeFixedWindowStats } from '@/lib/spread-calculator'
import { evaluateTradeSignal, getBlendedEntry, getDaysHeld } from '@/lib/trade-signals'
import TradeSignalCard from './TradeSignalCard'
import OpenTradeCard from './OpenTradeCard'
import TradeHistoryTable from './TradeHistoryTable'

interface Props {
  series: SpreadPoint[]
  selectedWindow: WindowKey
  liveSpreadPct: number | undefined
  rules: TradingRules
}

const TRANCHE_SIZES = ['50%', '30%', '20%']

export default function ActiveTradeTab({ series, selectedWindow, liveSpreadPct, rules }: Props) {
  const [tranches, setTranches] = useState<TradeTranche[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load trades from DB on mount
  useEffect(() => {
    fetch('/api/trades')
      .then((r) => r.json())
      .then((d) => setTranches(d.trades ?? []))
      .catch(() => setError('Failed to load trades'))
      .finally(() => setLoading(false))
  }, [])

  // Compute current Z-score (fixed window, always Rolling OFF for this tab per rules framework)
  const currentZscore = useMemo(() => {
    const last = series[series.length - 1]
    if (!last) return null
    const spread = liveSpreadPct ?? last.spread_pct
    const visibleValues = selectedWindow === 'ALL'
      ? series.map((p) => p.spread_pct)
      : series.filter((p) => p.date >= subtractMonths(last.date, WINDOW_MONTHS[selectedWindow]!)).map((p) => p.spread_pct)
    return computeFixedWindowStats(visibleValues, spread).zscore
  }, [series, selectedWindow, liveSpreadPct])

  const openTranches = useMemo(() => tranches.filter((t) => t.status === 'open'), [tranches])
  const closedTranches = useMemo(() => tranches.filter((t) => t.status === 'closed'), [tranches])

  const signal = useMemo(
    () => evaluateTradeSignal(currentZscore, openTranches, rules),
    [currentZscore, openTranches, rules]
  )

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleEnter() {
    setSaving(true)
    setError(null)
    const today = new Date().toISOString().split('T')[0]
    const spread = liveSpreadPct ?? series[series.length - 1]?.spread_pct ?? 0
    const tradeGroup = crypto.randomUUID()
    try {
      const res = await fetch('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trade_group: tradeGroup,
          tranche_num: 1,
          direction: currentZscore != null && currentZscore <= 0 ? 'long' : 'short',
          window_key: selectedWindow,
          entry_date: today,
          entry_spread: spread,
          entry_z: currentZscore,
          size_label: '50%',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save')
      setTranches((prev) => [data.trade, ...prev])
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleAdd() {
    setSaving(true)
    setError(null)
    if (openTranches.length === 0 || openTranches.length >= 3) { setSaving(false); return }
    const today = new Date().toISOString().split('T')[0]
    const spread = liveSpreadPct ?? series[series.length - 1]?.spread_pct ?? 0
    const oldest = [...openTranches].sort((a, b) => a.entry_date.localeCompare(b.entry_date))[0]
    const nextTranche = openTranches.length + 1
    const sizeLabel = TRANCHE_SIZES[nextTranche - 1] ?? '20%'
    try {
      const res = await fetch('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trade_group: oldest.trade_group,
          tranche_num: nextTranche,
          direction: oldest.direction,
          window_key: selectedWindow,
          entry_date: today,
          entry_spread: spread,
          entry_z: currentZscore,
          size_label: sizeLabel,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save')
      setTranches((prev) => [data.trade, ...prev])
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleCloseTranche(id: number, reason: 'target' | 'time_stop' | 'hard_stop' | 'manual') {
    setSaving(true)
    setError(null)
    const today = new Date().toISOString().split('T')[0]
    const spread = liveSpreadPct ?? series[series.length - 1]?.spread_pct ?? 0
    try {
      const res = await fetch(`/api/trades/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exit_date: today,
          exit_spread: spread,
          exit_z: currentZscore,
          exit_reason: reason,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to update')
      setTranches((prev) => prev.map((t) => (t.id === id ? data.trade : t)))
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleExitAll(reason: 'target' | 'time_stop' | 'hard_stop' | 'manual') {
    for (const t of openTranches) {
      await handleCloseTranche(t.id, reason)
    }
  }

  async function handleDeleteTranche(id: number) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/trades/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to delete')
      }
      setTranches((prev) => prev.filter((t) => t.id !== id))
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-slate-700 bg-slate-800/50 p-5 animate-pulse">
            <div className="h-6 bg-slate-700 rounded w-48 mb-3" />
            <div className="h-4 bg-slate-700 rounded w-96" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h2 className="text-base font-semibold text-white">Active Trade</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Signal engine based on QuantForge rules framework · 2Y window · Fixed mode · 60-day time stop · Hard stop Z ≤ −2.80
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-700 bg-red-900/20 px-4 py-3 text-sm text-red-400">
          {error}{' '}
          <button onClick={() => setError(null)} className="ml-2 underline hover:no-underline">Dismiss</button>
        </div>
      )}

      {/* Signal card */}
      <TradeSignalCard
        signal={signal}
        currentZ={currentZscore}
        liveSpreadPct={liveSpreadPct ?? null}
        selectedWindow={selectedWindow}
        openTranches={openTranches}
        onEnter={handleEnter}
        onAdd={handleAdd}
        onExitAll={handleExitAll}
        saving={saving}
      />

      {/* Open trade card */}
      {openTranches.length > 0 && (
        <OpenTradeCard
          openTranches={openTranches}
          liveSpreadPct={liveSpreadPct ?? null}
          currentZ={currentZscore}
          rules={rules}
          saving={saving}
          onCloseTranche={handleCloseTranche}
          onDeleteTranche={handleDeleteTranche}
        />
      )}

      {/* No open trade + neutral signal */}
      {openTranches.length === 0 && signal.action === 'NEUTRAL' && (
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-6 text-center">
          <div className="text-slate-500 text-sm">
            No active trade. Signal will update automatically when Z-score approaches entry threshold.
          </div>
          <div className="mt-2 text-xs text-slate-600">
            Entry triggers at Z ≤ {rules.strong_long_threshold} (Strong Long) on the {selectedWindow} window.
          </div>
        </div>
      )}

      {/* Trade history */}
      <TradeHistoryTable closedTranches={closedTranches} onDelete={handleDeleteTranche} />
    </div>
  )
}
