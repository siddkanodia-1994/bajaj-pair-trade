'use client'

import { useState, useMemo } from 'react'
import type { SpreadPoint, WindowKey, TradingRules } from '@/types'
import { WINDOW_MONTHS } from '@/types'
import { getExitBasedObservations, subtractMonths, computeFixedWindowStats } from '@/lib/spread-calculator'

interface Props {
  series: SpreadPoint[]
  selectedWindow: WindowKey
  liveSpreadPct?: number
  rollingMode: boolean
  rules: TradingRules
}

const HORIZONS = [5, 20, 40, 60, 90]
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function fmtSpread(n: number) {
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`
}

function fmtZ(n: number | null) {
  if (n == null) return '—'
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}`
}

function fmtReturn(n: number) {
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}pp`
}

export default function ForwardReturnObservations({ series, selectedWindow, liveSpreadPct, rollingMode, rules }: Props) {
  const [selectedHorizon, setSelectedHorizon] = useState(20)

  const last = series[series.length - 1]
  const first = series[0]
  if (!last || !first) return null

  const minYear = parseInt(first.date.slice(0, 4))
  const maxYear = parseInt(last.date.slice(0, 4))
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i)

  const [filterYear, setFilterYear] = useState<number | null>(null)
  const [filterMonth, setFilterMonth] = useState<number>(0) // 0-indexed

  const startDate = useMemo(() => {
    if (filterYear == null) return null
    const mm = String(filterMonth + 1).padStart(2, '0')
    return `${filterYear}-${mm}-01`
  }, [filterYear, filterMonth])

  const filteredSeries = useMemo(
    () => startDate ? series.filter(p => p.date >= startDate) : series,
    [series, startDate]
  )

  const spread = liveSpreadPct ?? last.spread_pct

  const visibleValues = selectedWindow === 'ALL'
    ? series.map((p) => p.spread_pct)
    : series.filter((p) => p.date >= subtractMonths(last.date, WINDOW_MONTHS[selectedWindow]!)).map((p) => p.spread_pct)

  const currentZscore = (() => {
    if (rollingMode) {
      const ws = last.windows[selectedWindow]
      return ws?.mean != null && ws?.std != null && ws.std > 0
        ? (spread - ws.mean) / ws.std
        : ws?.zscore ?? null
    }
    return computeFixedWindowStats(visibleValues, spread).zscore
  })()

  const fixedStats = !rollingMode ? computeFixedWindowStats(visibleValues) : null

  const observations = currentZscore != null
    ? getExitBasedObservations(
        filteredSeries, currentZscore, selectedWindow, selectedHorizon,
        rollingMode, rules, fixedStats?.mean ?? undefined, fixedStats?.std ?? undefined
      )
    : []

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
      <div className="flex items-start justify-between mb-4 gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            Analog Observations
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Historical instances where Z-score ({selectedWindow}) was within ±{rules.entry_band} of current
            {currentZscore != null ? ` (Z: ${fmtZ(currentZscore)})` : ''}
            {' '}· Exit at z ∈ [{rules.exit_zone_lo}, {rules.exit_zone_hi}] or time stop
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {/* Date slicer */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500">From:</span>
            <select
              value={filterYear ?? ''}
              onChange={e => setFilterYear(e.target.value ? parseInt(e.target.value) : null)}
              className="text-xs bg-slate-700 border border-slate-600 text-slate-300 rounded px-2 py-1 focus:outline-none"
            >
              <option value="">All</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            {filterYear != null && (
              <select
                value={filterMonth}
                onChange={e => setFilterMonth(parseInt(e.target.value))}
                className="text-xs bg-slate-700 border border-slate-600 text-slate-300 rounded px-2 py-1 focus:outline-none"
              >
                {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
            )}
          </div>
          {/* Horizon pills */}
          <div className="flex gap-1">
            {HORIZONS.map((h) => (
              <button
                key={h}
                onClick={() => setSelectedHorizon(h)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  selectedHorizon === h
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                }`}
              >
                {h}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {observations.length === 0 ? (
        <div className="text-sm text-slate-500 py-4 text-center">
          No observations found for this Z-score level and horizon.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 uppercase border-b border-slate-700">
              <th className="text-left pb-2">Entry Date</th>
              <th className="text-right pb-2">Entry Z</th>
              <th className="text-right pb-2">Entry Spread</th>
              <th className="text-left pb-2 pl-6">Exit Date</th>
              <th className="text-right pb-2">Exit Z</th>
              <th className="text-right pb-2">Exit Spread</th>
              <th className="text-right pb-2">Return</th>
              <th className="text-right pb-2">Days</th>
              <th className="text-right pb-2">Exit Reason</th>
            </tr>
          </thead>
          <tbody>
            {observations.map((obs, idx) => (
              <tr key={idx} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                <td className="py-2 text-slate-300">{fmtDate(obs.entry_date)}</td>
                <td className="py-2 text-right text-slate-400">{fmtZ(obs.entry_zscore)}</td>
                <td className="py-2 text-right text-slate-300">{fmtSpread(obs.entry_spread)}</td>
                <td className="py-2 pl-6 text-slate-300">{fmtDate(obs.exit_date)}</td>
                <td className="py-2 text-right text-slate-400">{fmtZ(obs.exit_zscore)}</td>
                <td className="py-2 text-right text-slate-300">{fmtSpread(obs.exit_spread)}</td>
                <td className={`py-2 text-right font-medium ${obs.return_pp > 0 ? 'text-green-400' : obs.return_pp < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                  {fmtReturn(obs.return_pp)}
                </td>
                <td className="py-2 text-right text-slate-400">{obs.calendar_days}</td>
                <td className="py-2 text-right">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${obs.exit_reason === 'target' ? 'bg-green-900/40 text-green-400' : 'bg-slate-700 text-slate-400'}`}>
                    {obs.exit_reason === 'target' ? 'target' : 'time stop'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-3 text-xs text-slate-600">
        {observations.length} observation{observations.length !== 1 ? 's' : ''} · Return = exit spread − entry spread (pp). Positive = spread widened.
      </div>
    </div>
  )
}
