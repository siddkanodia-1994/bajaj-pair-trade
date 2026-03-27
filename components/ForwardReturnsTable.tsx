'use client'

import type { SpreadPoint, WindowKey } from '@/types'
import { computeForwardReturns } from '@/lib/spread-calculator'

interface Props {
  series: SpreadPoint[]
  selectedWindow: WindowKey
  liveSpreadPct?: number
  rollingMode: boolean
}

function fmt(n: number | null, d = 2) {
  if (n == null) return '—'
  return n > 0 ? `+${n.toFixed(d)}` : n.toFixed(d)
}

function pctFmt(n: number | null) {
  if (n == null) return '—'
  return `${n.toFixed(1)}%`
}

function colorForReturn(n: number | null, direction: number) {
  if (n == null) return 'text-slate-400'
  const aligned = n * direction > 0
  const mag = Math.abs(n)
  if (aligned && mag > 2) return 'text-green-400'
  if (aligned && mag > 0.5) return 'text-green-300'
  if (!aligned && mag > 2) return 'text-red-400'
  if (!aligned) return 'text-red-300'
  return 'text-slate-300'
}

function colorForWinRate(n: number | null) {
  if (n == null) return 'text-slate-400'
  if (n > 65) return 'text-green-400'
  if (n > 55) return 'text-green-300'
  if (n < 35) return 'text-red-400'
  if (n < 45) return 'text-red-300'
  return 'text-slate-300'
}

export default function ForwardReturnsTable({ series, selectedWindow, liveSpreadPct, rollingMode: _rollingMode }: Props) {
  const last = series[series.length - 1]
  if (!last) return null

  const spread = liveSpreadPct ?? last.spread_pct
  const lastMean = last.windows[selectedWindow]?.mean ?? null
  const expectedDirection = lastMean != null ? (spread < lastMean ? 1 : -1) : 0

  const rows = computeForwardReturns(series, spread, selectedWindow)

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
          Forward Returns at Similar Spreads (±0.25pp band)
        </h2>
        <div className="text-xs text-slate-500">
          Current Spread: {spread > 0 ? '+' : ''}{spread.toFixed(2)}% ({selectedWindow})
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-500 uppercase border-b border-slate-700">
            <th className="text-left pb-2">Horizon</th>
            <th className="text-right pb-2">Avg Δ Spread</th>
            <th className="text-right pb-2">Median Δ Spread</th>
            <th className="text-right pb-2">Win Rate</th>
            <th className="text-right pb-2">Observations</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.horizon} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors">
              <td className="py-2.5 text-slate-300 font-medium">{row.horizon_label}</td>
              <td className={`text-right py-2.5 font-medium ${colorForReturn(row.avg_return, expectedDirection)}`}>
                {row.avg_return != null ? `${fmt(row.avg_return)}pp` : '—'}
              </td>
              <td className={`text-right py-2.5 ${colorForReturn(row.median_return, expectedDirection)}`}>
                {row.median_return != null ? `${fmt(row.median_return)}pp` : '—'}
              </td>
              <td className={`text-right py-2.5 font-medium ${colorForWinRate(row.win_rate)}`}>
                {pctFmt(row.win_rate)}
              </td>
              <td className="text-right py-2.5 text-slate-400">{row.observations}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 text-xs text-slate-600">
        "Win" = spread moves in the expected reversion direction.
        Δ Spread in percentage points (pp). Positive = spread widened.
      </div>
    </div>
  )
}
