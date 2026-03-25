'use client'

import { useEffect, useState, useCallback } from 'react'
import type { LiveSpreadData } from '@/types'
import { generateSignal } from '@/lib/signal-generator'
import type { SpreadPoint, WindowKey } from '@/types'
import { computeForwardReturns } from '@/lib/spread-calculator'

interface Props {
  initialData: LiveSpreadData | null
  spreadSeries: SpreadPoint[]
  selectedWindow: WindowKey
}

function fmt(n: number, decimals = 2) {
  return n.toFixed(decimals)
}

function fmtCrore(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L cr`
  return `₹${(n / 1000).toFixed(1)}k cr`
}

export default function LiveSpreadBanner({ initialData, spreadSeries, selectedWindow }: Props) {
  const [data, setData] = useState<LiveSpreadData | null>(initialData)
  const [loading, setLoading] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/prices/live')
      if (res.ok) {
        const json = await res.json()
        setData(json)
        setLastRefresh(new Date())
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const id = setInterval(refresh, 60_000) // refresh every 60s
    return () => clearInterval(id)
  }, [refresh])

  if (!data) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-6 animate-pulse">
        <div className="h-8 bg-slate-700 rounded w-48" />
      </div>
    )
  }

  // Compute live z-score by finding the last point's window stats, then override spread_pct with live
  const lastPoint = spreadSeries[spreadSeries.length - 1]
  const windowStats = lastPoint?.windows[selectedWindow]

  // Approximate live zscore using last known mean/std with live spread
  const liveZscore =
    windowStats?.mean != null && windowStats?.std != null && windowStats.std > 0
      ? (data.spread_pct - windowStats.mean) / windowStats.std
      : windowStats?.zscore ?? null

  const signal = generateSignal(liveZscore)

  const signalBgMap: Record<string, string> = {
    STRONG_LONG:  'bg-green-500/10 border-green-500',
    LONG:         'bg-green-500/5 border-green-400/50',
    HOLD:         'bg-slate-700/30 border-slate-600',
    SHORT:        'bg-red-500/5 border-red-400/50',
    STRONG_SHORT: 'bg-red-500/10 border-red-500',
  }

  return (
    <div className={`rounded-xl border p-5 ${signalBgMap[signal.type]}`}>
      {/* Top row: spread + signal */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-baseline gap-6">
          <div>
            <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Live Spread</div>
            <div className="text-4xl font-bold text-white">{fmt(data.spread_pct)}%</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Z-Score ({selectedWindow})</div>
            <div className={`text-3xl font-bold ${signal.tailwindColor}`}>
              {liveZscore != null ? (liveZscore > 0 ? '+' : '') + fmt(liveZscore) : '—'}
            </div>
          </div>
          {windowStats?.percentile_rank != null && (
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Percentile</div>
              <div className="text-3xl font-bold text-white">
                {Math.round(windowStats.percentile_rank)}
                <span className="text-lg text-slate-400">th</span>
              </div>
            </div>
          )}
        </div>

        {/* Signal badge */}
        <div className="text-right">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Signal ({selectedWindow})</div>
          <div className={`text-2xl font-bold ${signal.tailwindColor}`}>{signal.label}</div>
          <div className="text-sm text-slate-400 mt-0.5">{signal.description}</div>
        </div>
      </div>

      {/* Bottom row: mcaps + stake */}
      <div className="mt-4 flex flex-wrap gap-6 text-sm text-slate-400 border-t border-slate-700/50 pt-3">
        <div>
          <span className="text-slate-500">BAJAJFINSV </span>
          <span className="text-white font-medium">₹{fmt(data.finsv.price, 0)}</span>
          <span className={`ml-2 ${data.finsv.change_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {data.finsv.change_pct >= 0 ? '+' : ''}{fmt(data.finsv.change_pct)}%
          </span>
          <span className="ml-2 text-slate-500">{fmtCrore(data.finsv.mcap)}</span>
        </div>
        <div>
          <span className="text-slate-500">BAJAJFINANCE </span>
          <span className="text-white font-medium">₹{fmt(data.fin.price, 0)}</span>
          <span className={`ml-2 ${data.fin.change_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {data.fin.change_pct >= 0 ? '+' : ''}{fmt(data.fin.change_pct)}%
          </span>
          <span className="ml-2 text-slate-500">{fmtCrore(data.fin.mcap)}</span>
        </div>
        <div>
          <span className="text-slate-500">Stake </span>
          <span className="text-white font-medium">{fmt(data.stake_pct)}%</span>
        </div>
        <div>
          <span className="text-slate-500">Residual </span>
          <span className="text-white font-medium">{fmtCrore(data.residual_value)}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {loading && <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />}
          <span className="text-slate-600 text-xs">
            {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <button
            onClick={refresh}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors px-2 py-1 rounded border border-slate-700 hover:border-slate-500"
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  )
}
