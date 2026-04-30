'use client'

import { useEffect, useState, useCallback } from 'react'
import type { SpreadPoint, WindowKey, TradingRules } from '@/types'
import { WINDOW_MONTHS, DEFAULT_RULES } from '@/types'
import { generateSignal } from '@/lib/signal-generator'
import { subtractMonths, computeFixedWindowStats } from '@/lib/spread-calculator'
import type { GrasimLiveData, GrasimSubsidiary } from '@/types/grasim'
import { GRASIM_SUBSIDIARY_LABELS } from '@/types/grasim'

interface Props {
  selectedCompanies: GrasimSubsidiary[]
  rollingMode: boolean
  initialData: GrasimLiveData | null
  spreadSeries: SpreadPoint[]
  selectedWindow: WindowKey
  onDataLoaded?: (data: GrasimLiveData) => void
  rules?: TradingRules
}

function fmt(n: number, decimals = 2) {
  return n.toFixed(decimals)
}

function fmtCrore(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L cr`
  return `₹${(n / 1000).toFixed(1)}k cr`
}

export default function GrasimLiveBanner({
  selectedCompanies,
  rollingMode,
  initialData,
  spreadSeries,
  selectedWindow,
  onDataLoaded,
  rules = DEFAULT_RULES,
}: Props) {
  const [data, setData] = useState<GrasimLiveData | null>(initialData)
  const [loading, setLoading] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  useEffect(() => {
    if (initialData) {
      setData(initialData)
      setLastRefresh(new Date())
    }
  }, [initialData])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const params = selectedCompanies.join(',')
      const res = await fetch(`/api/prices/live-grasim?companies=${params}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
        setLastRefresh(new Date())
        onDataLoaded?.(json)
      }
    } finally {
      setLoading(false)
    }
  }, [selectedCompanies, onDataLoaded])

  // Re-fetch when selection changes
  useEffect(() => {
    refresh()
  }, [selectedCompanies.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh every 60s
  useEffect(() => {
    const id = setInterval(refresh, 60_000)
    return () => clearInterval(id)
  }, [refresh])

  if (!data) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-6 animate-pulse">
        <div className="h-8 bg-slate-700 rounded w-48" />
      </div>
    )
  }

  const lastPoint = spreadSeries[spreadSeries.length - 1]
  const windowStats = lastPoint?.windows[selectedWindow]

  const { liveZscore, livePercentile } = (() => {
    const lastDate = lastPoint?.date ?? ''
    const visibleValues = selectedWindow === 'ALL'
      ? spreadSeries.map((p) => p.spread_pct)
      : spreadSeries
          .filter((p) => p.date >= subtractMonths(lastDate, WINDOW_MONTHS[selectedWindow]!))
          .map((p) => p.spread_pct)

    const livePercentile = visibleValues.length > 0
      ? (visibleValues.filter((x) => x < data.spread_pct).length / visibleValues.length) * 100
      : windowStats?.percentile_rank ?? null

    if (rollingMode) {
      const z = windowStats?.mean != null && windowStats?.std != null && windowStats.std > 0
        ? (data.spread_pct - windowStats.mean) / windowStats.std
        : windowStats?.zscore ?? null
      return { liveZscore: z, livePercentile }
    }

    const stats = computeFixedWindowStats(visibleValues, data.spread_pct)
    return { liveZscore: stats.zscore, livePercentile }
  })()

  const signal = generateSignal(liveZscore, rules)

  const signalBgMap: Record<string, string> = {
    CAUTION_LONG:  'bg-amber-500/10 border-amber-500',
    STRONG_LONG:   'bg-green-500/10 border-green-500',
    LONG:          'bg-green-500/5 border-green-400/50',
    HOLD:          'bg-slate-700/30 border-slate-600',
    SHORT:         'bg-red-500/5 border-red-400/50',
    STRONG_SHORT:  'bg-red-500/10 border-red-500',
    CAUTION_SHORT: 'bg-amber-500/10 border-amber-500',
  }

  const isEodFallback = data.grasim.last_updated.length === 10

  return (
    <div className={`rounded-xl border overflow-hidden ${signalBgMap[signal.type]}`}>
      {isEodFallback && (
        <div className="flex items-center gap-2 px-5 py-2 bg-amber-500/15 border-b border-amber-500/30 text-amber-400 text-xs">
          <span>&#9888;</span>
          <span>Showing previous close ({data.grasim.last_updated}) — live prices unavailable. Refresh to retry.</span>
        </div>
      )}
      <div className="p-5">
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
            {livePercentile != null && (
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Percentile</div>
                <div className="text-3xl font-bold text-white">
                  {Math.round(livePercentile)}
                  <span className="text-lg text-slate-400">th</span>
                </div>
              </div>
            )}
          </div>

          <div className="text-right">
            <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Signal ({selectedWindow})</div>
            <div className={`text-2xl font-bold ${signal.tailwindColor}`}>{signal.label}</div>
            <div className="text-sm text-slate-400 mt-0.5">{signal.description}</div>
          </div>
        </div>

        {/* Bottom row: Grasim + basket + selected subsidiaries */}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-400 border-t border-slate-700/50 pt-3">
          <div>
            <span className="text-slate-500">GRASIM </span>
            <span className="text-white font-medium">₹{fmt(data.grasim.price, 0)}</span>
            <span className={`ml-2 ${data.grasim.change_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {data.grasim.change_pct >= 0 ? '+' : ''}{fmt(data.grasim.change_pct)}%
            </span>
            <span className="ml-2 text-slate-500">{fmtCrore(data.grasim.mcap)}</span>
          </div>

          {selectedCompanies.map((company) => {
            const quote = data[company.toLowerCase() as keyof GrasimLiveData] as typeof data.grasim
            if (!quote?.price) return null
            return (
              <div key={company}>
                <span className="text-slate-500">{company} </span>
                <span className="text-white font-medium">₹{fmt(quote.price, 0)}</span>
                <span className={`ml-2 ${quote.change_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {quote.change_pct >= 0 ? '+' : ''}{fmt(quote.change_pct)}%
                </span>
              </div>
            )
          })}

          <div>
            <span className="text-slate-500">Basket </span>
            <span className="text-white font-medium">{fmtCrore(data.basket_mcap)}</span>
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
    </div>
  )
}
