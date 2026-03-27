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
} from 'recharts'
import type { SpreadPoint, WindowKey } from '@/types'
import { WINDOW_KEYS, WINDOW_MONTHS } from '@/types'
import { subtractMonths, computeFixedWindowStats } from '@/lib/spread-calculator'

interface Props {
  series: SpreadPoint[]
  selectedWindow: WindowKey
  onWindowChange: (w: WindowKey) => void
  liveSpreadPct?: number
  rollingMode: boolean
  lightMode?: boolean
}

interface ChartPoint {
  date: string
  spread: number
  mean: number | null
  upper1: number | null
  lower1: number | null
  upper2: number | null
  lower2: number | null
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

export default function SpreadChart({ series, selectedWindow, onWindowChange, liveSpreadPct, rollingMode, lightMode }: Props) {
  const chartColors = lightMode ? {
    grid:     '#D6CCC2',
    axisTick: '#5C4F46',
    axisLine: '#8B7D73',
    label:    '#5C4F46',
  } : {
    grid:     '#1e293b',
    axisTick: '#64748b',
    axisLine: '#334155',
    label:    '#64748b',
  }
  // Calendar-anchored slice
  let visibleSeries: SpreadPoint[]
  if (series.length === 0 || selectedWindow === 'ALL') {
    visibleSeries = series
  } else {
    const lastDate = series[series.length - 1].date
    const startDate = subtractMonths(lastDate, WINDOW_MONTHS[selectedWindow]!)
    const startIdx = series.findIndex((p) => p.date >= startDate)
    visibleSeries = series.slice(startIdx === -1 ? 0 : startIdx)
  }

  const windowStats = visibleSeries.map((p) => p.windows[selectedWindow])
  const mean = windowStats.findLast((w) => w?.mean != null)?.mean

  // Fixed-window stats (when rolling mode is off): one mean/SD for the entire visible window
  const fixedStats = !rollingMode
    ? computeFixedWindowStats(visibleSeries.map((p) => p.spread_pct))
    : null

  // Build chart data
  const chartData: ChartPoint[] = visibleSeries.map((p) => {
    const w = p.windows[selectedWindow]
    return {
      date: p.date,
      spread: p.spread_pct,
      mean:   fixedStats?.mean   ?? w?.mean   ?? null,
      upper1: fixedStats?.upper_1sd ?? w?.upper_1sd ?? null,
      lower1: fixedStats?.lower_1sd ?? w?.lower_1sd ?? null,
      upper2: fixedStats?.upper_2sd ?? w?.upper_2sd ?? null,
      lower2: fixedStats?.lower_2sd ?? w?.lower_2sd ?? null,
    }
  })

  // Append live spread as the last data point so the spread line extends to today
  if (liveSpreadPct != null && chartData.length > 0) {
    const now = new Date()
    const istOffset = 5.5 * 60 * 60 * 1000
    const today = new Date(now.getTime() + istOffset).toISOString().split('T')[0]
    const lastDate = chartData[chartData.length - 1].date
    if (today > lastDate) {
      const lastStats = visibleSeries[visibleSeries.length - 1]?.windows[selectedWindow]
      chartData.push({
        date: today,
        spread: liveSpreadPct,
        mean: lastStats?.mean ?? null,
        upper1: lastStats?.upper_1sd ?? null,
        lower1: lastStats?.lower_1sd ?? null,
        upper2: lastStats?.upper_2sd ?? null,
        lower2: lastStats?.lower_2sd ?? null,
      })
    } else {
      // Today's EOD already in series — update the last point to live value
      chartData[chartData.length - 1].spread = liveSpreadPct
    }
  }

  // Thin data for performance (max 500 points) — only needed for 3Y+
  const thinned = chartData.length > 500
    ? chartData.filter((_, i) => i % Math.ceil(chartData.length / 500) === 0 || i === chartData.length - 1)
    : chartData

  // Y-axis domain
  const allYValues = thinned.flatMap(d =>
    [d.spread, d.upper2, d.lower2, d.upper1, d.lower1].filter((v): v is number => v != null)
  )
  if (liveSpreadPct != null) allYValues.push(liveSpreadPct)
  const yMin = allYValues.length ? Math.min(...allYValues) : -10
  const yMax = allYValues.length ? Math.max(...allYValues) : 20
  const yPad = Math.max((yMax - yMin) * 0.12, 1)
  const yDomain: [number, number] = [
    Math.round((yMin - yPad) * 2) / 2,
    Math.round((yMax + yPad) * 2) / 2,
  ]

  const xAxisInterval = Math.max(0, Math.floor(thinned.length / 8) - 1)

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
          <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
          <XAxis
            dataKey="date"
            interval={xAxisInterval}
            tickFormatter={formatDate}
            tick={{ fill: chartColors.axisTick, fontSize: 11 }}
            axisLine={{ stroke: chartColors.axisLine }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => `${v.toFixed(1)}%`}
            tick={{ fill: chartColors.axisTick, fontSize: 11 }}
            axisLine={{ stroke: chartColors.axisLine }}
            tickLine={false}
            domain={yDomain}
            allowDataOverflow={false}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* ±2SD band — no data override so x-axis stays consistent */}
          <Area dataKey="upper2" stroke="none" fill="#ef444415" legendType="none" name="upper2" />
          <Area dataKey="lower2" stroke="none" fill="#22c55e15" legendType="none" name="lower2" />

          {/* ±1SD band */}
          <Area dataKey="upper1" stroke="none" fill="#ef444420" legendType="none" name="upper1" />
          <Area dataKey="lower1" stroke="none" fill="#22c55e20" legendType="none" name="lower1" />

          {/* Mean line */}
          <Line
            dataKey="mean"
            stroke="#94a3b8"
            strokeWidth={1}
            strokeDasharray="4 4"
            dot={false}
            activeDot={false}
            name="mean"
            legendType="none"
          />

          {/* SD boundary lines */}
          <Line dataKey="upper1" stroke="#ef444440" strokeWidth={1} dot={false} activeDot={false} name="upper1Line" legendType="none" />
          <Line dataKey="lower1" stroke="#22c55e40" strokeWidth={1} dot={false} activeDot={false} name="lower1Line" legendType="none" />
          <Line dataKey="upper2" stroke="#ef444425" strokeWidth={1} dot={false} activeDot={false} name="upper2Line" legendType="none" />
          <Line dataKey="lower2" stroke="#22c55e25" strokeWidth={1} dot={false} activeDot={false} name="lower2Line" legendType="none" />

          {/* Spread line */}
          <Line
            dataKey="spread"
            stroke="#3b82f6"
            strokeWidth={1.5}
            dot={false}
            name="spread"
            activeDot={{ r: 3, fill: '#3b82f6' }}
          />

          {/* Live spread horizontal dotted line */}
          {liveSpreadPct != null && (
            <ReferenceLine
              y={liveSpreadPct}
              stroke="#f59e0b"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              label={{
                value: `${liveSpreadPct > 0 ? '+' : ''}${liveSpreadPct.toFixed(2)}%`,
                fill: '#f59e0b',
                fontSize: 10,
                position: 'insideTopRight',
              }}
            />
          )}

          {/* Mean label */}
          {mean != null && (
            <ReferenceLine
              y={mean}
              stroke="transparent"
              label={{ value: `μ ${mean.toFixed(1)}%`, fill: chartColors.label, fontSize: 10, position: 'insideTopLeft' }}
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
          <span className="flex items-center gap-1"><span className="w-4 h-px bg-amber-400 border-dashed border-t inline-block" /> Live</span>
        )}
      </div>
    </div>
  )
}
