'use client'

import { useState, useEffect } from 'react'
import type { TradeSignal, TradeTranche, SpreadPoint, WindowKey } from '@/types'
import { WINDOW_KEYS, WINDOW_MONTHS } from '@/types'
import { getBlendedEntry, getDaysHeld } from '@/lib/trade-signals'
import { subtractMonths, computeFixedWindowStats } from '@/lib/spread-calculator'

type Overrides = { spread: number; z: number | null; date: string; sizeLabel?: string; window?: string }

interface Props {
  signal: TradeSignal
  currentZ: number | null
  liveSpreadPct: number | null
  selectedWindow: string
  openTranches: TradeTranche[]
  series: SpreadPoint[]
  onEnter: (ov?: Overrides) => void
  onAdd: (ov?: Overrides) => void
  onExitAll: (reason: 'target' | 'time_stop' | 'hard_stop' | 'manual') => void
  saving: boolean
  readOnly?: boolean
}

function fmt(n: number, d = 2) {
  return `${n > 0 ? '+' : ''}${n.toFixed(d)}`
}

const EXIT_REASONS: { value: 'target' | 'time_stop' | 'hard_stop' | 'manual'; label: string }[] = [
  { value: 'target',    label: 'Target Hit' },
  { value: 'time_stop', label: 'Time Stop' },
  { value: 'hard_stop', label: 'Hard Stop' },
  { value: 'manual',    label: 'Manual Exit' },
]

type NonAllWindow = Exclude<WindowKey, 'ALL'>
const WINDOW_OPTIONS = WINDOW_KEYS.filter((w): w is NonAllWindow => w !== 'ALL')

/** Compute Z-score for a given spread value against the selected window's distribution */
function computeZForSpread(series: SpreadPoint[], spread: number, window: WindowKey): number | null {
  if (series.length === 0) return null
  const last = series[series.length - 1]
  const months = WINDOW_MONTHS[window]
  const values = months != null
    ? series.filter((p) => p.date >= subtractMonths(last.date, months)).map((p) => p.spread_pct)
    : series.map((p) => p.spread_pct)
  if (values.length < 10) return null
  const stats = computeFixedWindowStats(values, spread)
  return stats.zscore
}

export default function TradeSignalCard({
  signal, currentZ, liveSpreadPct, selectedWindow,
  openTranches, series, onEnter, onAdd, onExitAll, saving, readOnly = false,
}: Props) {
  const [manualOpen, setManualOpen] = useState(false)
  const [manualSpread, setManualSpread] = useState('')
  const [manualZ, setManualZ] = useState('')
  const [manualDate, setManualDate] = useState('')
  const [manualSize, setManualSize] = useState('50%')
  const [manualWindow, setManualWindow] = useState<NonAllWindow>(
    (WINDOW_OPTIONS as string[]).includes(selectedWindow) ? selectedWindow as NonAllWindow : '2Y'
  )

  const todayISO = new Date().toISOString().split('T')[0]
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  // Auto-compute Z-score whenever spread or window changes
  useEffect(() => {
    const spread = parseFloat(manualSpread)
    if (!isNaN(spread) && manualSpread !== '') {
      const z = computeZForSpread(series, spread, manualWindow)
      setManualZ(z != null ? z.toFixed(2) : '')
    }
  }, [manualSpread, manualWindow, series])

  function openManual() {
    setManualSpread(liveSpreadPct != null ? liveSpreadPct.toFixed(2) : '')
    setManualDate(todayISO)
    setManualWindow(
      (WINDOW_OPTIONS as string[]).includes(selectedWindow) ? selectedWindow as NonAllWindow : '2Y'
    )
    setManualOpen(true)
  }

  function submitManual() {
    const spread = parseFloat(manualSpread)
    const z = manualZ !== '' ? parseFloat(manualZ) : null
    const date = manualDate || todayISO
    if (isNaN(spread)) return
    const ov = { spread, z: isNaN(z as number) ? null : z, date, sizeLabel: manualSize, window: manualWindow }
    openTranches.length === 0 ? onEnter(ov) : onAdd(ov)
    setManualOpen(false)
  }

  const spreadStr = liveSpreadPct != null ? `${liveSpreadPct.toFixed(2)}%` : '—'
  const zStr = currentZ != null ? fmt(currentZ) : '—'

  const isEnter = signal.action === 'ENTER'
  const isAdd   = signal.action === 'ADD'
  const isExit  = signal.action === 'EXIT_TARGET' || signal.action === 'EXIT_TIME' || signal.action === 'EXIT_HARD_STOP'

  // For ADD signal, show the next tranche info
  const nextTrancheNum = openTranches.length + 1
  const trancheSizes = ['50%', '30%', '20%', '10%', '10%']
  const nextSize = trancheSizes[nextTrancheNum - 1] ?? '20%'

  // Days held info for exit signals
  const oldestEntry = openTranches.length > 0
    ? [...openTranches].sort((a, b) => a.entry_date.localeCompare(b.entry_date))[0]
    : null
  const daysHeld = oldestEntry ? getDaysHeld(oldestEntry.entry_date) : 0

  const { blendedSpread, blendedZ } = getBlendedEntry(openTranches)

  return (
    <div className={`rounded-xl border p-5 ${signal.borderClass} ${signal.bgClass}`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Trade Signal</div>
          <div className={`text-2xl font-bold ${signal.tailwindColor}`}>{signal.label}</div>
          <div className="text-sm text-slate-400 mt-1 max-w-lg">{signal.description}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="flex items-end gap-5 justify-end">
            <div>
              <div className="text-xs text-slate-500 mb-1">Spread</div>
              <div className={`text-3xl font-bold ${signal.tailwindColor}`}>{spreadStr}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Z-Score ({selectedWindow})</div>
              <div className={`text-3xl font-bold ${signal.tailwindColor}`}>{zStr}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Entry preview (ENTER or ADD) */}
      {!readOnly && (isEnter || isAdd) && (
        <div className="mt-4 pt-4 border-t border-slate-700/50">
          <div className="text-xs text-slate-500 mb-2">Entry will be stamped at:</div>
          <div className="flex flex-wrap gap-4 text-sm mb-4">
            <span className="text-slate-300">Spread: <span className="font-medium text-white">{spreadStr}</span></span>
            <span className="text-slate-300">Z-Score: <span className="font-medium text-white">{zStr}</span></span>
            <span className="text-slate-300">Date: <span className="font-medium text-white">{today}</span></span>
            <span className="text-slate-300">Window: <span className="font-medium text-white">{selectedWindow}</span></span>
          </div>
          {isEnter && (
            <button
              onClick={() => onEnter()}
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Initiate Trade — Tranche 1 (50%)'}
            </button>
          )}
          {isAdd && (
            <button
              onClick={() => onAdd()}
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : `Add Tranche ${nextTrancheNum} (${nextSize})`}
            </button>
          )}
        </div>
      )}

      {/* Exit action (EXIT signals) */}
      {!readOnly && isExit && openTranches.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-700/50">
          <div className="text-xs text-slate-500 mb-2">
            Close all open tranches — exit spread: <span className="text-white font-medium">{spreadStr}</span>
            {' · '}Z: <span className="text-white font-medium">{zStr}</span>
            {' · '}Days held: <span className="text-white font-medium">{daysHeld}</span>
          </div>
          <div className="text-xs text-slate-500 mb-3">
            Blended entry: <span className="text-white font-medium">{blendedSpread.toFixed(2)}%</span>
            {blendedZ != null && <> · Blended Z: <span className="text-white font-medium">{fmt(blendedZ)}</span></>}
            {liveSpreadPct != null && (
              <>
                {' · '}P&L:{' '}
                <span className={`font-medium ${(liveSpreadPct - blendedSpread) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {fmt(liveSpreadPct - blendedSpread)}pp
                </span>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {EXIT_REASONS.map((r) => (
              <button
                key={r.value}
                onClick={() => onExitAll(r.value)}
                disabled={saving}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  signal.action === 'EXIT_HARD_STOP'
                    ? 'bg-red-700 hover:bg-red-600 text-white'
                    : signal.action === 'EXIT_TIME'
                    ? 'bg-amber-700 hover:bg-amber-600 text-white'
                    : 'bg-green-700 hover:bg-green-600 text-white'
                }`}
              >
                {saving ? 'Saving…' : `Exit — ${r.label}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Manual override — always visible when a new tranche can still be added */}
      {!readOnly && openTranches.length < 5 && !isEnter && !isAdd && (
        <div className="mt-4 pt-3 border-t border-slate-700/30">
          <button
            onClick={() => manualOpen ? setManualOpen(false) : openManual()}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
          >
            <span>{manualOpen ? '▾' : '▸'}</span>
            {openTranches.length === 0
              ? 'Enter trade manually'
              : `Add Tranche ${openTranches.length + 1} manually`}
          </button>

          {manualOpen && (
            <div className="mt-3 rounded-lg border border-slate-600 bg-slate-900/60 p-4">
              <div className="text-xs text-slate-500 mb-3">
                Override — edit any field before confirming:
              </div>
              <div className="flex flex-wrap gap-3 mb-4">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500">Spread (%)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={manualSpread}
                    onChange={(e) => setManualSpread(e.target.value)}
                    className="w-28 text-sm bg-slate-700 border border-slate-500 text-white rounded px-2 py-1.5 focus:outline-none focus:border-blue-500"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500">Z-Score <span className="text-slate-600">(auto)</span></span>
                  <input
                    type="number"
                    step="0.01"
                    value={manualZ}
                    onChange={(e) => setManualZ(e.target.value)}
                    placeholder="auto"
                    className="w-28 text-sm bg-slate-700 border border-slate-500 text-white rounded px-2 py-1.5 focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500">Entry Date</span>
                  <input
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="text-sm bg-slate-700 border border-slate-500 text-white rounded px-2 py-1.5 focus:outline-none focus:border-blue-500"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500">Size</span>
                  <select
                    value={manualSize}
                    onChange={(e) => setManualSize(e.target.value)}
                    className="text-sm bg-slate-700 border border-slate-500 text-white rounded px-2 py-1.5 focus:outline-none focus:border-blue-500"
                  >
                    {[10,20,30,40,50,60,70,80,90,100].map((p) => (
                      <option key={p} value={`${p}%`}>{p}%</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500">Window</span>
                  <select
                    value={manualWindow}
                    onChange={(e) => setManualWindow(e.target.value as NonAllWindow)}
                    className="text-sm bg-slate-700 border border-slate-500 text-white rounded px-2 py-1.5 focus:outline-none focus:border-blue-500 w-20"
                  >
                    {WINDOW_OPTIONS.map((w) => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex gap-2 items-center">
                <button
                  onClick={submitManual}
                  disabled={saving || manualSpread === '' || isNaN(parseFloat(manualSpread))}
                  className="px-4 py-1.5 rounded-lg bg-slate-600 hover:bg-slate-500 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving…' : openTranches.length === 0
                    ? 'Confirm Entry — Tranche 1'
                    : `Confirm Add — Tranche ${openTranches.length + 1}`}
                </button>
                <button
                  onClick={() => setManualOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Cancel
                </button>
                {manualSpread !== '' && isNaN(parseFloat(manualSpread)) && (
                  <span className="text-xs text-red-400">Invalid spread value</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
