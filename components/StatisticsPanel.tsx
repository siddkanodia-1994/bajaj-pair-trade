'use client'

import type { SpreadPoint, WindowKey, TradingRules } from '@/types'
import { WINDOW_KEYS, WINDOW_MONTHS, DEFAULT_RULES } from '@/types'
import { generateSignal } from '@/lib/signal-generator'
import { subtractMonths, computeFixedWindowStats } from '@/lib/spread-calculator'

interface Props {
  series: SpreadPoint[]
  selectedWindow: WindowKey
  liveSpreadPct?: number
  rollingMode: boolean
  rules?: TradingRules
}

function fmt(n: number | null, d = 2) {
  if (n == null) return '—'
  return n.toFixed(d)
}

function zscoreBar(z: number | null) {
  if (z == null) return null
  const clamped = Math.max(-3, Math.min(3, z))
  const pct = ((clamped + 3) / 6) * 100
  const color = z <= -1.5 ? '#4ade80' : z >= 1.5 ? '#f87171' : z <= -1 ? '#86efac' : z >= 1 ? '#fca5a5' : '#94a3b8'
  return { pct, color }
}

export default function StatisticsPanel({ series, selectedWindow, liveSpreadPct, rollingMode, rules = DEFAULT_RULES }: Props) {
  const last = series[series.length - 1]
  if (!last) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5 text-slate-500 text-sm">
        No data yet. Seed historical prices first.
      </div>
    )
  }

  const spread = liveSpreadPct ?? last.spread_pct

  // Fixed-window stats: slice visible series and compute one mean/SD for the whole window
  const effectiveStats = (() => {
    if (rollingMode) return last.windows[selectedWindow]
    const lastDate = last.date
    const visibleValues = selectedWindow === 'ALL'
      ? series.map((p) => p.spread_pct)
      : series.filter((p) => p.date >= subtractMonths(lastDate, WINDOW_MONTHS[selectedWindow]!)).map((p) => p.spread_pct)
    return computeFixedWindowStats(visibleValues, spread)
  })()

  const ws = effectiveStats
  const liveZscore =
    ws?.mean != null && ws?.std != null && ws.std > 0
      ? (spread - ws.mean) / ws.std
      : ws?.zscore ?? null

  const signal = generateSignal(liveZscore, rules)
  const bar = zscoreBar(liveZscore)

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
        Statistics — {selectedWindow} Window
      </h2>

      {/* Key stats */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Current Spread', value: `${fmt(spread)}%` },
          { label: 'Historical Mean', value: `${fmt(ws?.mean)}%` },
          { label: 'Std Deviation', value: `${fmt(ws?.std)}%` },
          { label: 'Z-Score', value: liveZscore != null ? (liveZscore > 0 ? '+' : '') + fmt(liveZscore) : '—', color: signal.tailwindColor },
          { label: '+1 SD', value: `${fmt(ws?.upper_1sd)}%` },
          { label: '−1 SD', value: `${fmt(ws?.lower_1sd)}%` },
          { label: '+2 SD', value: `${fmt(ws?.upper_2sd)}%` },
          { label: '−2 SD', value: `${fmt(ws?.lower_2sd)}%` },
          { label: 'Percentile', value: ws?.percentile_rank != null ? `${Math.round(ws.percentile_rank)}th` : '—' },
          { label: 'Data Points', value: series.filter(p => p.windows[selectedWindow]?.mean != null).length.toString() },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-slate-900/50 rounded-lg p-2.5">
            <div className="text-xs text-slate-500 mb-0.5">{label}</div>
            <div className={`text-sm font-semibold ${color ?? 'text-white'}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Z-score bar */}
      {bar && (
        <div>
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>−3σ</span><span>−2σ</span><span>−1σ</span><span>0</span><span>+1σ</span><span>+2σ</span><span>+3σ</span>
          </div>
          <div className="relative h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="absolute left-0 top-0 h-full bg-gradient-to-r from-green-600 via-slate-500 to-red-600 opacity-30 w-full rounded-full"
            />
            <div
              className="absolute top-0 h-full w-0.5 rounded-full"
              style={{ left: `${bar.pct}%`, backgroundColor: bar.color }}
            />
          </div>
        </div>
      )}

      {/* Multi-window comparison table */}
      <div>
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">All Windows</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500">
              <th className="text-left pb-1">Window</th>
              <th className="text-right pb-1">Mean</th>
              <th className="text-right pb-1">Z-Score</th>
              <th className="text-right pb-1">Pctile</th>
              <th className="text-right pb-1">Signal</th>
            </tr>
          </thead>
          <tbody>
            {WINDOW_KEYS.map((wk) => {
              const w = last.windows[wk]
              const z = w?.mean != null && w?.std != null && w.std > 0
                ? (spread - w.mean) / w.std
                : w?.zscore ?? null
              const sig = generateSignal(z, rules)
              const isSelected = wk === selectedWindow
              return (
                <tr
                  key={wk}
                  className={`border-t border-slate-700/50 ${isSelected ? 'bg-slate-700/30' : ''}`}
                >
                  <td className={`py-1 ${isSelected ? 'text-white font-medium' : 'text-slate-400'}`}>{wk}</td>
                  <td className="text-right text-slate-400">{w?.mean != null ? `${w.mean.toFixed(1)}%` : '—'}</td>
                  <td className={`text-right font-medium ${sig.tailwindColor}`}>
                    {z != null ? (z > 0 ? '+' : '') + z.toFixed(2) : '—'}
                  </td>
                  <td className="text-right text-slate-400">
                    {w?.percentile_rank != null ? `${Math.round(w.percentile_rank)}th` : '—'}
                  </td>
                  <td className={`text-right font-medium ${sig.tailwindColor}`}>
                    {w?.mean != null ? sig.label : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
