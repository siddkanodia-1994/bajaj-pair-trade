'use client'

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { SpreadPoint, WindowKey } from '@/types'
import { WINDOW_KEYS } from '@/types'

interface Props {
  series: SpreadPoint[]
  selectedWindow: WindowKey
  onWindowChange: (w: WindowKey) => void
  liveSpreadPct?: number
}

interface ChartPoint {
  date: string
  spread: number
  mean: number | null
  upper1: number | null
  lower1: number | null
  upper2: number | null
  lower2: number | null
  band1: [number, number] | null
  band2: [number, number] | null
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
}

function formatTooltipDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) => {
  if (!active || !payload || !payload.length) return null
  const spread = payload.find((p) => p.name === 'spread')?.value
  const mean = payload.find((p) => p.name === 'mean')?.value
  const zscore = spread != null && mean != null ? spread - mean : null

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs shadow-xl">
      <div className="text-slate-400 mb-2">{label ? formatTooltipDate(label) : ''}</div>
      {spread != null && (
        <div className="text-white font-medium">Spread: {spread.toFixed(2)}%</div>
      )}
      {mean != null && (
        <div className="text-slate-400">Mean: {mean.toFixed(2)}%</div>
      )}
    </div>
  )
}

export default function SpreadChart({ series, selectedWindow, onWindowChange, liveSpreadPct }: Props) {
  const windowStats = series.map((p) => p.windows[selectedWindow])
  const mean = windowStats.find((w) => w?.mean != null)?.mean

  // Build chart data — only include points that have stats for the selected window
  const chartData: ChartPoint[] = series
    .map((p, i) => {
      const w = p.windows[selectedWindow]
      return {
        date: p.date,
        spread: p.spread_pct,
        mean: w?.mean ?? null,
        upper1: w?.upper_1sd ?? null,
        lower1: w?.lower_1sd ?? null,
        upper2: w?.upper_2sd ?? null,
        lower2: w?.lower_2sd ?? null,
        band1: w?.upper_1sd != null && w?.lower_1sd != null
          ? [w.lower_1sd, w.upper_1sd] as [number, number]
          : null,
        band2: w?.upper_2sd != null && w?.lower_2sd != null
          ? [w.lower_2sd, w.upper_2sd] as [number, number]
          : null,
      }
    })

  // Thin data for performance (max 500 points)
  const thinned = chartData.length > 500
    ? chartData.filter((_, i) => i % Math.ceil(chartData.length / 500) === 0 || i === chartData.length - 1)
    : chartData

  // Tick every ~6 months
  const tickInterval = Math.max(1, Math.floor(thinned.length / 12))
  const ticks = thinned
    .filter((_, i) => i % tickInterval === 0)
    .map((d) => d.date)

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
      {/* Window selector */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
          Implied Spread %
        </h2>
        <div className="flex gap-1">
          {WINDOW_KEYS.map((w) => (
            <button
              key={w}
              onClick={() => onWindowChange(w)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                selectedWindow === w
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={thinned} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="date"
            ticks={ticks}
            tickFormatter={formatDate}
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={{ stroke: '#334155' }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => `${v.toFixed(1)}%`}
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={{ stroke: '#334155' }}
            tickLine={false}
            domain={['auto', 'auto']}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* ±2SD band */}
          <Area
            dataKey="upper2"
            data={thinned.filter(d => d.upper2 != null)}
            stroke="none"
            fill="#ef444415"
            legendType="none"
            name="upper2"
          />
          <Area
            dataKey="lower2"
            data={thinned.filter(d => d.lower2 != null)}
            stroke="none"
            fill="#22c55e15"
            legendType="none"
            name="lower2"
          />

          {/* ±1SD band */}
          <Area
            dataKey="upper1"
            stroke="none"
            fill="#ef444420"
            legendType="none"
            name="upper1"
          />
          <Area
            dataKey="lower1"
            stroke="none"
            fill="#22c55e20"
            legendType="none"
            name="lower1"
          />

          {/* Mean line */}
          <Line
            dataKey="mean"
            stroke="#94a3b8"
            strokeWidth={1}
            strokeDasharray="4 4"
            dot={false}
            name="mean"
            legendType="none"
          />

          {/* Upper/Lower SD reference lines as lines */}
          <Line dataKey="upper1" stroke="#ef444440" strokeWidth={1} dot={false} name="upper1" legendType="none" />
          <Line dataKey="lower1" stroke="#22c55e40" strokeWidth={1} dot={false} name="lower1" legendType="none" />
          <Line dataKey="upper2" stroke="#ef444425" strokeWidth={1} dot={false} name="upper2SD" legendType="none" />
          <Line dataKey="lower2" stroke="#22c55e25" strokeWidth={1} dot={false} name="lower2SD" legendType="none" />

          {/* Spread line */}
          <Line
            dataKey="spread"
            stroke="#3b82f6"
            strokeWidth={1.5}
            dot={false}
            name="spread"
            activeDot={{ r: 3, fill: '#3b82f6' }}
          />

          {/* Live spread marker */}
          {liveSpreadPct != null && (
            <ReferenceLine
              y={liveSpreadPct}
              stroke="#f59e0b"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              label={{ value: `Live ${liveSpreadPct.toFixed(1)}%`, fill: '#f59e0b', fontSize: 10, position: 'insideTopRight' }}
            />
          )}

          {/* Mean reference line label */}
          {mean != null && (
            <ReferenceLine
              y={mean}
              stroke="transparent"
              label={{ value: `μ ${mean.toFixed(1)}%`, fill: '#64748b', fontSize: 10, position: 'insideTopLeft' }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex gap-4 mt-2 text-xs text-slate-500 justify-end">
        <span className="flex items-center gap-1"><span className="w-4 h-px bg-blue-500 inline-block" /> Spread</span>
        <span className="flex items-center gap-1"><span className="w-4 h-px bg-slate-500 border-dashed border-t inline-block" /> Mean</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500/20 inline-block" /> +1/2SD</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500/20 inline-block" /> -1/2SD</span>
        {liveSpreadPct != null && (
          <span className="flex items-center gap-1"><span className="w-4 h-px bg-amber-400 inline-block" /> Live</span>
        )}
      </div>
    </div>
  )
}
