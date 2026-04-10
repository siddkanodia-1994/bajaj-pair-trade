'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'

interface Tick {
  time: string      // HH:MM
  spread_pct: number
}

interface ChartPoint {
  time: string
  spread: number
  mean: number | null
  upper1: number | null
  lower1: number | null
  upper2: number | null
  lower2: number | null
}

type Timeframe = '5m' | '15m' | '30m' | '1h'
const TF_MINUTES: Record<Timeframe, number> = { '5m': 5, '15m': 15, '30m': 30, '1h': 60 }

interface Props {
  pair: 'bajaj' | 'grasim'
  mean: number | null
  stdDev: number | null
  lightMode?: boolean
}

function isMarketOpen(): boolean {
  const now = new Date()
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
  const day = ist.getUTCDay()
  if (day === 0 || day === 6) return false
  const m = ist.getUTCHours() * 60 + ist.getUTCMinutes()
  return m >= 9 * 60 + 15 && m <= 15 * 60 + 30
}

function todayIST(): string {
  const now = new Date()
  return new Date(now.getTime() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0]
}

/** Convert HH:MM to minutes since midnight */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** Aggregate 1-minute ticks into candles of `bucketMins` minutes. Returns last spread in each bucket. */
function aggregate(
  ticks: Tick[],
  bucketMins: number,
  mean: number | null,
  upper1: number | null,
  lower1: number | null,
  upper2: number | null,
  lower2: number | null,
): ChartPoint[] {
  if (ticks.length === 0) return []
  const buckets = new Map<string, number>()
  for (const tick of ticks) {
    const mins = timeToMinutes(tick.time)
    const bucketStart = Math.floor(mins / bucketMins) * bucketMins
    const h = String(Math.floor(bucketStart / 60)).padStart(2, '0')
    const m = String(bucketStart % 60).padStart(2, '0')
    buckets.set(`${h}:${m}`, tick.spread_pct)
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, spread]) => ({ time, spread, mean, upper1, lower1, upper2, lower2 }))
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null
  const spread = payload.find((p) => p.name === 'spread')?.value
  const meanVal = payload.find((p) => p.name === 'mean')?.value
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs shadow-xl">
      <div className="text-slate-400 mb-1">{label}</div>
      {spread != null && <div className="text-white font-medium">Spread: {spread.toFixed(2)}%</div>}
      {meanVal != null && <div className="text-slate-400">Mean: {meanVal.toFixed(2)}%</div>}
    </div>
  )
}

export default function IntradaySpreadChart({ pair, mean, stdDev, lightMode }: Props) {
  const apiBase = pair === 'bajaj' ? '/api/intraday' : '/api/grasim/intraday'

  const [selectedDate, setSelectedDate] = useState<string>('')
  const [ticks, setTicks] = useState<Tick[]>([])
  const [timeframe, setTimeframe] = useState<Timeframe>('5m')
  const [loading, setLoading] = useState(false)

  const chartColors = lightMode
    ? { grid: '#d1d5db', axisTick: '#374151', axisLine: '#9ca3af', label: '#374151' }
    : { grid: '#1e293b', axisTick: '#64748b', axisLine: '#334155', label: '#64748b' }

  // Fetch available dates on mount
  useEffect(() => {
    fetch(apiBase)
      .then((r) => r.json())
      .then((d) => {
        const dates: string[] = d.availableDates ?? []
        const today = todayIST()
        setSelectedDate(dates.includes(today) ? today : (dates[0] ?? today))
      })
      .catch(() => {
        const today = todayIST()
        setSelectedDate(today)
      })
  }, [apiBase])

  // Fetch ticks for selected date
  const fetchTicks = useCallback(() => {
    if (!selectedDate) return
    setLoading(true)
    fetch(`${apiBase}?date=${selectedDate}`)
      .then((r) => r.json())
      .then((d) => setTicks(d.ticks ?? []))
      .catch(() => setTicks([]))
      .finally(() => setLoading(false))
  }, [apiBase, selectedDate])

  useEffect(() => {
    fetchTicks()
  }, [fetchTicks])

  // Auto-refresh every 60s during market hours for today
  useEffect(() => {
    if (selectedDate !== todayIST()) return
    if (!isMarketOpen()) return
    const id = setInterval(() => {
      if (isMarketOpen()) fetchTicks()
    }, 60_000)
    return () => clearInterval(id)
  }, [selectedDate, fetchTicks])

  // SD values (constant across all chart points)
  const upper1 = mean != null && stdDev != null ? mean + stdDev : null
  const lower1 = mean != null && stdDev != null ? mean - stdDev : null
  const upper2 = mean != null && stdDev != null ? mean + 2 * stdDev : null
  const lower2 = mean != null && stdDev != null ? mean - 2 * stdDev : null

  const chartData = aggregate(ticks, TF_MINUTES[timeframe], mean, upper1, lower1, upper2, lower2)

  // Y-axis domain
  const allY = chartData.map((d) => d.spread)
  if (mean != null) allY.push(mean)
  if (upper2 != null) allY.push(upper2)
  if (lower2 != null) allY.push(lower2)
  const yMin = allY.length ? Math.min(...allY) : -5
  const yMax = allY.length ? Math.max(...allY) : 20
  const yPad = Math.max((yMax - yMin) * 0.12, 1)
  const yDomain: [number, number] = [
    Math.round((yMin - yPad) * 2) / 2,
    Math.round((yMax + yPad) * 2) / 2,
  ]

  const isEmpty = chartData.length === 0
  const isToday = selectedDate === todayIST()

  return (
    <div
      className={`rounded-xl border p-5 ${lightMode ? 'border-gray-200' : 'border-slate-700 bg-slate-800/50'}`}
      style={lightMode ? { backgroundColor: '#ffffff', boxShadow: '0 1px 8px rgba(0,0,0,0.10)' } : undefined}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className={`text-sm font-semibold uppercase tracking-wider ${lightMode ? 'text-slate-700' : 'text-slate-300'}`}>
            Intraday Spread %
          </h2>
          {isToday && isMarketOpen() && (
            <span className="text-xs text-green-400 font-medium">● live</span>
          )}
          {loading && <span className={`text-xs ${lightMode ? 'text-slate-400' : 'text-slate-500'}`}>loading…</span>}
        </div>

        <div className="flex items-center gap-3">
          {/* Timeframe pills */}
          <div className="flex gap-1">
            {(['5m', '15m', '30m', '1h'] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  timeframe === tf
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Date picker */}
          <input
            type="date"
            value={selectedDate}
            max={todayIST()}
            onChange={(e) => setSelectedDate(e.target.value)}
            className={`text-xs rounded px-2 py-1 border outline-none cursor-pointer ${
              lightMode
                ? 'bg-white border-gray-300 text-slate-700'
                : 'bg-slate-700 border-slate-600 text-slate-200'
            }`}
          />
        </div>
      </div>

      {/* Chart */}
      <div style={lightMode ? { border: '1px solid #6C584C' } : undefined}>
        {isEmpty ? (
          <div className="flex items-center justify-center" style={{ height: 340 }}>
            <span className={`text-sm ${lightMode ? 'text-slate-400' : 'text-slate-500'}`}>
              {isToday ? 'No intraday data yet — ticks start at 9:15 AM IST' : 'No data for this date'}
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis
                dataKey="time"
                tick={{ fill: chartColors.axisTick, fontSize: 11 }}
                axisLine={{ stroke: chartColors.axisLine }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={(v) => `${(v as number).toFixed(1)}%`}
                tick={{ fill: chartColors.axisTick, fontSize: 11 }}
                axisLine={{ stroke: chartColors.axisLine }}
                tickLine={false}
                domain={yDomain}
                allowDataOverflow={false}
              />
              <Tooltip content={<CustomTooltip />} />

              {/* Mean line — solid red */}
              <Line dataKey="mean"   stroke="#ef4444" strokeWidth={1.5} dot={false} activeDot={false} name="mean"   legendType="none" />

              {/* SD lines */}
              <Line dataKey="upper2" stroke="#22c55e" strokeWidth={1.5} dot={false} activeDot={false} name="upper2" legendType="none" />
              <Line dataKey="upper1" stroke="#eab308" strokeWidth={1.5} dot={false} activeDot={false} name="upper1" legendType="none" />
              <Line dataKey="lower1" stroke="#f97316" strokeWidth={1.5} dot={false} activeDot={false} name="lower1" legendType="none" />
              <Line dataKey="lower2" stroke="#06b6d4" strokeWidth={1.5} dot={false} activeDot={false} name="lower2" legendType="none" />

              {/* Intraday spread line */}
              <Line
                dataKey="spread"
                stroke="#3b82f6"
                strokeWidth={1.5}
                dot={false}
                name="spread"
                activeDot={{ r: 3, fill: '#3b82f6' }}
              />

              {/* Mean μ label */}
              {mean != null && (
                <ReferenceLine
                  y={mean}
                  stroke="transparent"
                  label={{ value: `μ ${mean.toFixed(1)}%`, fill: chartColors.label, fontSize: 10, position: 'insideTopLeft' }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Legend */}
      <div className={`flex gap-4 mt-2 text-xs justify-end ${lightMode ? 'text-slate-600' : 'text-slate-500'}`}>
        <span className="flex items-center gap-1"><span className="w-4 h-px bg-blue-500 inline-block" /> Spread</span>
        <span className="flex items-center gap-1"><span className="w-4 h-px inline-block" style={{ backgroundColor: '#ef4444' }} /> Mean</span>
        <span className="flex items-center gap-1"><span className="w-4 h-px inline-block" style={{ backgroundColor: '#22c55e' }} /> +2SD</span>
        <span className="flex items-center gap-1"><span className="w-4 h-px inline-block" style={{ backgroundColor: '#eab308' }} /> +1SD</span>
        <span className="flex items-center gap-1"><span className="w-4 h-px inline-block" style={{ backgroundColor: '#f97316' }} /> −1SD</span>
        <span className="flex items-center gap-1"><span className="w-4 h-px inline-block" style={{ backgroundColor: '#06b6d4' }} /> −2SD</span>
      </div>
    </div>
  )
}
