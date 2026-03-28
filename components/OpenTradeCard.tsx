'use client'

import { useState } from 'react'
import type { TradeTranche, TradingRules } from '@/types'
import { getBlendedEntry, getDaysHeld } from '@/lib/trade-signals'

interface Props {
  openTranches: TradeTranche[]
  liveSpreadPct: number | null
  currentZ: number | null
  rules: TradingRules
  saving: boolean
  onCloseTranche: (id: number, reason: 'target' | 'time_stop' | 'hard_stop' | 'manual') => void
  onDeleteTranche: (id: number) => void
}

const TIME_STOP_DAYS = 60
const HARD_STOP_Z = -2.8

function fmt(n: number, d = 2) {
  return `${n > 0 ? '+' : ''}${n.toFixed(d)}`
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const EXIT_REASONS: { value: 'target' | 'time_stop' | 'hard_stop' | 'manual'; label: string }[] = [
  { value: 'target',    label: 'Target' },
  { value: 'time_stop', label: 'Time Stop' },
  { value: 'hard_stop', label: 'Hard Stop' },
  { value: 'manual',    label: 'Manual' },
]

export default function OpenTradeCard({
  openTranches, liveSpreadPct, currentZ, rules, saving,
  onCloseTranche, onDeleteTranche,
}: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)

  if (openTranches.length === 0) return null

  const sorted = [...openTranches].sort((a, b) => a.entry_date.localeCompare(b.entry_date))
  const oldest = sorted[0]
  const daysHeld = getDaysHeld(oldest.entry_date)
  const daysLeft = Math.max(0, TIME_STOP_DAYS - daysHeld)
  const progressPct = Math.min(100, (daysHeld / TIME_STOP_DAYS) * 100)

  const { blendedSpread, blendedZ } = getBlendedEntry(openTranches)
  const direction = oldest.direction
  const windowKey = oldest.window_key

  const pnlPp = liveSpreadPct != null ? liveSpreadPct - blendedSpread : null
  const pnlPositive = pnlPp != null && (direction === 'long' ? pnlPp > 0 : pnlPp < 0)

  // Compute hard stop spread from Z
  const hardStopSpreadApprox = (() => {
    if (blendedZ == null || blendedSpread == null) return null
    // spread_hardstop ≈ blendedSpread + (HARD_STOP_Z - blendedZ) * std
    // We don't have std here, so show Z reference only
    return null
  })()

  return (
    <div className="rounded-xl border border-blue-500/50 bg-blue-500/5 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Active Trade</div>
          <div className="text-lg font-bold text-white">
            {direction === 'long' ? 'Long BAJAJFINSV / Short BAJFINANCE' : 'Short BAJAJFINSV / Long BAJFINANCE'}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Window: {windowKey} · {openTranches.length} tranche{openTranches.length !== 1 ? 's' : ''} open</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">Days Held</div>
          <div className="text-3xl font-bold text-white">{daysHeld}</div>
          <div className="text-xs text-slate-500">of {TIME_STOP_DAYS} day time stop</div>
        </div>
      </div>

      {/* P&L summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-slate-900/60 rounded-lg p-3">
          <div className="text-xs text-slate-500 mb-0.5">Blended Entry</div>
          <div className="text-base font-semibold text-white">{blendedSpread.toFixed(2)}%</div>
          {blendedZ != null && <div className="text-xs text-slate-400">Z: {fmt(blendedZ)}</div>}
        </div>
        <div className="bg-slate-900/60 rounded-lg p-3">
          <div className="text-xs text-slate-500 mb-0.5">Live Spread</div>
          <div className="text-base font-semibold text-white">{liveSpreadPct != null ? `${liveSpreadPct.toFixed(2)}%` : '—'}</div>
          {currentZ != null && <div className="text-xs text-slate-400">Z: {fmt(currentZ)}</div>}
        </div>
        <div className="bg-slate-900/60 rounded-lg p-3">
          <div className="text-xs text-slate-500 mb-0.5">Unrealised P&L</div>
          <div className={`text-base font-semibold ${pnlPp == null ? 'text-slate-400' : pnlPositive ? 'text-green-400' : 'text-red-400'}`}>
            {pnlPp != null ? `${fmt(pnlPp)}pp` : '—'}
          </div>
          <div className="text-xs text-slate-500">{pnlPositive ? 'Winning' : pnlPp != null ? 'Against' : ''}</div>
        </div>
        <div className="bg-slate-900/60 rounded-lg p-3">
          <div className="text-xs text-slate-500 mb-0.5">Time Remaining</div>
          <div className="text-base font-semibold text-white">{daysLeft}d</div>
          <div className="text-xs text-slate-500">before time stop</div>
        </div>
      </div>

      {/* Time stop progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          <span>Time Stop Progress</span>
          <span>{daysHeld} / {TIME_STOP_DAYS} days</span>
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${daysHeld >= 50 ? 'bg-amber-500' : 'bg-blue-500'}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Reference levels */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-400 mb-4 pb-4 border-b border-slate-700/50">
        <span>Exit Zone: Z returns to <span className="text-white font-medium">[{rules.exit_zone_lo}, {rules.exit_zone_hi}]</span></span>
        <span>Hard Stop: Z ≤ <span className="text-red-400 font-medium">{HARD_STOP_Z}</span></span>
        <span>Add-to-Trade Gap: <span className="text-white font-medium">{rules.add_to_trade_gap} SD</span></span>
      </div>

      {/* Tranche breakdown */}
      <div>
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Tranches</div>
        <div className="space-y-2">
          {sorted.map((t) => (
            <div key={t.id} className="bg-slate-900/60 rounded-lg p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-bold text-slate-300 bg-slate-700 px-1.5 py-0.5 rounded">
                    #{t.tranche_num}
                  </span>
                  <span className="text-xs text-blue-300 font-medium">{t.size_label}</span>
                  <span className="text-xs text-slate-400">{fmtDate(t.entry_date)}</span>
                  <span className="text-xs text-slate-300">Spread: <span className="font-medium">{t.entry_spread.toFixed(2)}%</span></span>
                  {t.entry_z != null && (
                    <span className="text-xs text-slate-400">Z: {fmt(t.entry_z)}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                    className="text-xs text-slate-400 hover:text-slate-200 border border-slate-600 hover:border-slate-400 px-2 py-1 rounded transition-colors"
                  >
                    Mark Exited ▾
                  </button>
                  {pendingDeleteId === t.id ? (
                    <>
                      <button
                        onClick={() => { onDeleteTranche(t.id); setPendingDeleteId(null) }}
                        disabled={saving}
                        className="text-xs text-red-400 hover:text-red-300 border border-red-700 px-2 py-1 rounded transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setPendingDeleteId(null)}
                        className="text-xs text-slate-400 hover:text-slate-200 border border-slate-600 px-2 py-1 rounded transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setPendingDeleteId(t.id)}
                      className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                      title="Delete tranche"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Exit reason picker (expanded) */}
              {expandedId === t.id && (
                <div className="mt-3 pt-3 border-t border-slate-700/50">
                  <div className="text-xs text-slate-500 mb-2">
                    Exit at live spread <span className="text-white">{liveSpreadPct != null ? `${liveSpreadPct.toFixed(2)}%` : '—'}</span>
                    {' · '}Z <span className="text-white">{currentZ != null ? fmt(currentZ) : '—'}</span>
                    {' · '}P&L{' '}
                    {liveSpreadPct != null ? (
                      <span className={`font-medium ${(liveSpreadPct - t.entry_spread) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {fmt(liveSpreadPct - t.entry_spread)}pp
                      </span>
                    ) : '—'}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {EXIT_REASONS.map((r) => (
                      <button
                        key={r.value}
                        onClick={() => { onCloseTranche(t.id, r.value); setExpandedId(null) }}
                        disabled={saving}
                        className="px-3 py-1 rounded text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors disabled:opacity-50"
                      >
                        {saving ? '…' : r.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
