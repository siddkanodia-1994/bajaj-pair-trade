'use client'

import type { SpreadPoint, WindowKey, ForwardReturnRow } from '@/types'
import { WINDOW_MONTHS } from '@/types'
import { generateSignal, signalBorderColor, signalBgColor } from '@/lib/signal-generator'
import { computeForwardReturns, subtractMonths, computeFixedWindowStats } from '@/lib/spread-calculator'

interface Props {
  series: SpreadPoint[]
  selectedWindow: WindowKey
  liveSpreadPct?: number
  rollingMode: boolean
}

function fmt(n: number | null, d = 2) {
  if (n == null) return '—'
  const s = n.toFixed(d)
  return n > 0 ? `+${s}` : s
}

function fmtPct(n: number | null) {
  if (n == null) return '—'
  return `${n.toFixed(1)}%`
}

interface SignalCardProps {
  title: string
  horizon: number
  fwdReturn: ForwardReturnRow | undefined
  zscore: number | null
  window: WindowKey
}

function SignalCard({ title, horizon, fwdReturn, zscore, window }: SignalCardProps) {
  const signal = generateSignal(zscore)
  const borderClass = signalBorderColor(signal.type)
  const bgClass = signalBgColor(signal.type)

  return (
    <div className={`rounded-xl border p-5 ${borderClass} ${bgClass}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-xs text-slate-400 uppercase tracking-wider">{title}</div>
          <div className={`text-xl font-bold mt-1 ${signal.tailwindColor}`}>{signal.label}</div>
          <div className="text-xs text-slate-400 mt-0.5">{signal.description}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">Z-Score</div>
          <div className={`text-2xl font-bold ${signal.tailwindColor}`}>
            {zscore != null ? (zscore > 0 ? '+' : '') + zscore.toFixed(2) : '—'}
          </div>
        </div>
      </div>

      {fwdReturn && fwdReturn.observations > 0 ? (
        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-700/50">
          <div className="text-center">
            <div className="text-xs text-slate-500">{fwdReturn.horizon_label} Avg</div>
            <div className={`text-sm font-semibold mt-0.5 ${(fwdReturn.avg_return ?? 0) * (zscore ?? 0) < 0 ? 'text-green-400' : 'text-red-400'}`}>
              {fmt(fwdReturn.avg_return)}pp
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-slate-500">Win Rate</div>
            <div className={`text-sm font-semibold mt-0.5 ${(fwdReturn.win_rate ?? 0) > 55 ? 'text-green-400' : (fwdReturn.win_rate ?? 0) > 45 ? 'text-slate-300' : 'text-red-400'}`}>
              {fwdReturn.win_rate != null ? `${fwdReturn.win_rate.toFixed(0)}%` : '—'}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-slate-500">Obs</div>
            <div className="text-sm font-semibold mt-0.5 text-slate-300">{fwdReturn.observations}</div>
          </div>
        </div>
      ) : (
        <div className="text-xs text-slate-600 mt-3 pt-3 border-t border-slate-700/50">
          Insufficient historical data for forward return analysis
        </div>
      )}
    </div>
  )
}

export default function SignalPanel({ series, selectedWindow, liveSpreadPct, rollingMode }: Props) {
  const last = series[series.length - 1]
  if (!last) return null

  const spread = liveSpreadPct ?? last.spread_pct

  const zscore = (() => {
    if (rollingMode) {
      const ws = last.windows[selectedWindow]
      return ws?.mean != null && ws?.std != null && ws.std > 0
        ? (spread - ws.mean) / ws.std
        : ws?.zscore ?? null
    }
    const lastDate = last.date
    const visibleValues = selectedWindow === 'ALL'
      ? series.map((p) => p.spread_pct)
      : series.filter((p) => p.date >= subtractMonths(lastDate, WINDOW_MONTHS[selectedWindow]!)).map((p) => p.spread_pct)
    return computeFixedWindowStats(visibleValues, spread).zscore
  })()

  const forwardReturns = computeForwardReturns(series, zscore ?? 0, selectedWindow, [5, 20, 60, 90])
  const fwd5  = forwardReturns.find(r => r.horizon === 5)
  const fwd90 = forwardReturns.find(r => r.horizon === 90)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <SignalCard
        title="Short-Term (1–5 Days)"
        horizon={5}
        fwdReturn={fwd5}
        zscore={zscore}
        window={selectedWindow}
      />
      <SignalCard
        title="Medium-Term (Up to 90 Days)"
        horizon={90}
        fwdReturn={fwd90}
        zscore={zscore}
        window={selectedWindow}
      />
    </div>
  )
}
