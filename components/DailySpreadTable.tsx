'use client'

import { useState, useMemo, useEffect } from 'react'
import type { SpreadPoint, StakeHistoryRow, WindowKey, WindowStats } from '@/types'
import { WINDOW_MONTHS, WINDOW_KEYS } from '@/types'
import { calendarRollingStats, computeFixedWindowStats, subtractMonths, getApplicableStake, getQuarterEndDate } from '@/lib/spread-calculator'

interface Props {
  spreadSeries: SpreadPoint[]
  stakes: StakeHistoryRow[]
  rollingMode: boolean
  onStakesChange: (updated: StakeHistoryRow[]) => void
  externalWindow?: WindowKey
}

const PAGE_SIZE = 100

function formatCr(v: number | null): string {
  if (v === null || isNaN(v)) return '—'
  return v.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

function formatPct(v: number | null, digits = 2): string {
  if (v === null || isNaN(v)) return '—'
  return v.toFixed(digits) + '%'
}

function fmtQuarter(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  const month = d.getMonth()
  const year = d.getFullYear()
  if (month >= 3 && month <= 5) return `Q1 FY${String(year + 1).slice(2)}`
  if (month >= 6 && month <= 8) return `Q2 FY${String(year + 1).slice(2)}`
  if (month >= 9 && month <= 11) return `Q3 FY${String(year + 1).slice(2)}`
  return `Q4 FY${String(year).slice(2)}`
}

interface DisplayRow {
  date: string
  stake_pct: number
  fin_mcap: number
  finsv_mcap: number
  underlying_stake_value: number
  residual_value: number
  spread_pct: number
  stats: WindowStats
  zscore: number | null
}

export default function DailySpreadTable({ spreadSeries, stakes, rollingMode, onStakesChange, externalWindow }: Props) {
  const [editValues, setEditValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(stakes.map((s) => [s.quarter_end_date, String(s.stake_pct)]))
  )
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [stakeEditorOpen, setStakeEditorOpen] = useState(false)

  const [selectedWindow, setSelectedWindow] = useState<WindowKey>(externalWindow ?? '1Y')
  useEffect(() => { if (externalWindow) setSelectedWindow(externalWindow) }, [externalWindow])
  const [page, setPage] = useState(0)
  const [sortDesc, setSortDesc] = useState(true)

  // Recompute display rows using stakes with quarter-end assignment
  const displayRows: DisplayRow[] = useMemo(() => {
    // spreadSeries arrives sorted ASC — preserve that order for stats computation
    const recomputed = spreadSeries.map((p) => {
      const stake_pct = getApplicableStake(p.date, stakes)
      const underlying_stake_value = (stake_pct / 100) * p.fin_mcap
      const residual_value = p.finsv_mcap - underlying_stake_value
      const spread_pct = p.finsv_mcap > 0 ? (residual_value / p.finsv_mcap) * 100 : 0
      return {
        date: p.date,
        stake_pct,
        fin_mcap: p.fin_mcap,
        finsv_mcap: p.finsv_mcap,
        underlying_stake_value,
        residual_value,
        spread_pct,
      }
    })

    const dates = recomputed.map((r) => r.date)
    const spreadValues = recomputed.map((r) => r.spread_pct)
    const monthsOrAll: number | 'ALL' = selectedWindow === 'ALL' ? 'ALL' : (WINDOW_MONTHS[selectedWindow] ?? 12)
    const statsArr = calendarRollingStats(dates, spreadValues, monthsOrAll)

    // Fixed mode: slice to the selected window, then compute one mean/SD for all rows
    const fixedStats = !rollingMode
      ? (() => {
          const lastDate = dates[dates.length - 1] ?? ''
          const windowValues = selectedWindow === 'ALL'
            ? spreadValues
            : spreadValues.filter((_, i) => dates[i] >= subtractMonths(lastDate, WINDOW_MONTHS[selectedWindow]!))
          return computeFixedWindowStats(windowValues)
        })()
      : null

    const rows: DisplayRow[] = recomputed.map((r, i) => {
      const stats = fixedStats ?? statsArr[i]
      const zscore = fixedStats != null && fixedStats.mean != null && fixedStats.std != null && fixedStats.std > 0
        ? (r.spread_pct - fixedStats.mean) / fixedStats.std
        : stats.zscore ?? null
      return { ...r, stats, zscore }
    })

    rows.sort((a, b) =>
      sortDesc ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)
    )

    return rows
  }, [spreadSeries, stakes, selectedWindow, sortDesc, rollingMode])

  const totalPages = Math.ceil(displayRows.length / PAGE_SIZE)
  const pageRows = displayRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Auto-inject a placeholder row for the current quarter if it's not in the DB yet
  const effectiveStakes = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    const currentQuarterEnd = getQuarterEndDate(today)
    const exists = stakes.some((s) => s.quarter_end_date === currentQuarterEnd)
    if (exists) return stakes
    // Find most recent prior stake
    const prior = [...stakes]
      .filter((s) => s.quarter_end_date < currentQuarterEnd)
      .sort((a, b) => b.quarter_end_date.localeCompare(a.quarter_end_date))[0]
    const priorStake = prior?.stake_pct ?? stakes[0]?.stake_pct ?? 52
    return [
      ...stakes,
      { id: -1, quarter_end_date: currentQuarterEnd, stake_pct: priorStake, source: null },
    ]
  }, [stakes])

  // Ensure editValues has an entry for the placeholder quarter
  useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    const currentQuarterEnd = getQuarterEndDate(today)
    if (!(currentQuarterEnd in editValues)) {
      const placeholder = effectiveStakes.find((s) => s.quarter_end_date === currentQuarterEnd)
      if (placeholder) {
        setEditValues((v) => ({ ...v, [currentQuarterEnd]: String(placeholder.stake_pct) }))
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveStakes])

  const sortedStakes = [...effectiveStakes].sort(
    (a, b) => new Date(b.quarter_end_date).getTime() - new Date(a.quarter_end_date).getTime()
  )

  async function handleSave(quarterEnd: string) {
    const raw = editValues[quarterEnd]
    const val = parseFloat(raw)
    if (isNaN(val) || val <= 0 || val > 100) {
      setErrors((e) => ({ ...e, [quarterEnd]: 'Must be 0–100' }))
      return
    }
    setErrors((e) => ({ ...e, [quarterEnd]: '' }))
    setSaving((s) => ({ ...s, [quarterEnd]: true }))

    try {
      const res = await fetch('/api/stake', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quarter_end_date: quarterEnd, stake_pct: val }),
      })
      if (!res.ok) {
        const err = await res.json()
        setErrors((e) => ({ ...e, [quarterEnd]: err.error ?? 'Save failed' }))
        return
      }
      // Propagate updated stakes to parent → triggers full series recomputation
      const exists = stakes.some((s) => s.quarter_end_date === quarterEnd)
      const updatedStakes = exists
        ? stakes.map((s) => s.quarter_end_date === quarterEnd ? { ...s, stake_pct: val } : s)
        : [...stakes, { id: Date.now(), quarter_end_date: quarterEnd, stake_pct: val, source: null }]
      onStakesChange(updatedStakes)
    } catch {
      setErrors((e) => ({ ...e, [quarterEnd]: 'Network error' }))
    } finally {
      setSaving((s) => ({ ...s, [quarterEnd]: false }))
    }
  }

  function handleWindowChange(w: WindowKey) {
    setSelectedWindow(w)
    setPage(0)
  }

  return (
    <div className="space-y-4">

      {/* Quarterly Stakes Editor */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/40">
        <button
          onClick={() => setStakeEditorOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <span className="text-sm font-medium text-slate-200">
            Quarterly Stakes
            <span className="ml-2 text-xs text-slate-500 font-normal">
              — edits saved to database, spread recalculates immediately
            </span>
          </span>
          <span className="text-slate-500 text-xs">{stakeEditorOpen ? '▲ collapse' : '▼ expand'}</span>
        </button>

        {stakeEditorOpen && (
          <div className="overflow-x-auto border-t border-slate-700">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-700">
                  <th className="px-4 py-2 text-left text-slate-400 font-medium">Quarter</th>
                  <th className="px-4 py-2 text-left text-slate-400 font-medium">Period End</th>
                  <th className="px-4 py-2 text-right text-slate-400 font-medium">Stake %</th>
                  <th className="px-4 py-2 text-right text-slate-400 font-medium w-24"></th>
                </tr>
              </thead>
              <tbody>
                {sortedStakes.map((row) => {
                  const qe = row.quarter_end_date
                  const isSaving = saving[qe]
                  const err = errors[qe]
                  const draft = editValues[qe] ?? String(row.stake_pct)
                  const isDirty = parseFloat(draft) !== row.stake_pct

                  return (
                    <tr key={qe} className="border-b border-slate-700/50 hover:bg-slate-800/30">
                      <td className="px-4 py-2 text-slate-300 font-medium">{fmtQuarter(qe)}</td>
                      <td className="px-4 py-2 text-slate-400">
                        {new Date(qe + 'T00:00:00').toLocaleDateString('en-IN', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={draft}
                            onChange={(e) => {
                              setEditValues((v) => ({ ...v, [qe]: e.target.value }))
                              setErrors((er) => ({ ...er, [qe]: '' }))
                            }}
                            className="w-24 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-right text-white focus:outline-none focus:border-blue-500 text-xs"
                          />
                          <span className="text-slate-500">%</span>
                        </div>
                        {err && <div className="text-red-400 text-xs mt-0.5 text-right">{err}</div>}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => handleSave(qe)}
                          disabled={isSaving || !isDirty}
                          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                            isSaving
                              ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                              : isDirty
                              ? 'bg-blue-600 text-white hover:bg-blue-500'
                              : 'bg-slate-800 text-slate-600 cursor-not-allowed'
                          }`}
                        >
                          {isSaving ? 'Saving…' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Table Controls */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Window selector */}
        <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
          {(WINDOW_KEYS as WindowKey[]).map((w) => (
            <button
              key={w}
              onClick={() => handleWindowChange(w)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                selectedWindow === w
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {w}
            </button>
          ))}
        </div>

        {/* Sort toggle */}
        <button
          onClick={() => { setSortDesc((d) => !d); setPage(0) }}
          className="text-xs text-slate-400 hover:text-white flex items-center gap-1 bg-slate-800 px-3 py-1.5 rounded-lg"
        >
          Date {sortDesc ? '↓ Newest first' : '↑ Oldest first'}
        </button>

        <div className="ml-auto text-xs text-slate-500">
          {displayRows.length.toLocaleString()} rows · Page {page + 1}/{totalPages}
        </div>
      </div>

      {/* Data Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900">
              <th className="px-3 py-2.5 text-left text-slate-400 font-medium whitespace-nowrap">Date</th>
              <th className="px-3 py-2.5 text-right text-slate-400 font-medium whitespace-nowrap">Stake %</th>
              <th className="px-3 py-2.5 text-right text-slate-400 font-medium whitespace-nowrap">% Spread</th>
              <th className="px-3 py-2.5 text-right text-purple-400 font-medium whitespace-nowrap">Z-Score ({selectedWindow})</th>
              <th className="px-3 py-2.5 text-right text-slate-400 font-medium whitespace-nowrap">Discount (₹ Cr)</th>
              <th className="px-3 py-2.5 text-right text-slate-400 font-medium whitespace-nowrap">MC Finance (₹ Cr)</th>
              <th className="px-3 py-2.5 text-right text-slate-400 font-medium whitespace-nowrap">Stake Value (₹ Cr)</th>
              <th className="px-3 py-2.5 text-right text-slate-400 font-medium whitespace-nowrap">MC Finserv (₹ Cr)</th>
              <th className="px-3 py-2.5 text-right text-blue-400 font-medium whitespace-nowrap">Mean ({selectedWindow})</th>
              <th className="px-3 py-2.5 text-right text-red-400 font-medium whitespace-nowrap">+2σ</th>
              <th className="px-3 py-2.5 text-right text-orange-400 font-medium whitespace-nowrap">+1σ</th>
              <th className="px-3 py-2.5 text-right text-green-400 font-medium whitespace-nowrap">-1σ</th>
              <th className="px-3 py-2.5 text-right text-emerald-400 font-medium whitespace-nowrap">-2σ</th>
              <th className="px-3 py-2.5 text-right text-slate-400 font-medium whitespace-nowrap">SD</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, idx) => {
              const isNeg = row.spread_pct < 0
              const spreadColor = isNeg ? 'text-green-400' : row.spread_pct > 0 ? 'text-red-400' : 'text-slate-300'
              const discountColor = row.residual_value < 0 ? 'text-green-400' : row.residual_value > 0 ? 'text-red-400' : 'text-slate-300'
              const isEven = idx % 2 === 0
              return (
                <tr
                  key={row.date}
                  className={`border-b border-slate-800/50 ${isEven ? 'bg-slate-950' : 'bg-slate-900/30'} hover:bg-slate-800/40 transition-colors`}
                >
                  <td className="px-3 py-2 text-slate-300 font-mono whitespace-nowrap">
                    {new Date(row.date + 'T00:00:00').toLocaleDateString('en-IN', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-400 font-mono">
                    {row.stake_pct.toFixed(2)}%
                  </td>
                  <td className={`px-3 py-2 text-right font-mono font-semibold ${spreadColor}`}>
                    {formatPct(row.spread_pct)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-white">
                    {row.zscore == null ? '—' : `${row.zscore > 0 ? '+' : ''}${row.zscore.toFixed(2)}`}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono ${discountColor}`}>
                    {formatCr(row.residual_value)}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-300 font-mono">
                    {formatCr(row.fin_mcap)}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-300 font-mono">
                    {formatCr(row.underlying_stake_value)}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-300 font-mono">
                    {formatCr(row.finsv_mcap)}
                  </td>
                  <td className="px-3 py-2 text-right text-blue-300 font-mono">
                    {formatPct(row.stats?.mean ?? null)}
                  </td>
                  <td className="px-3 py-2 text-right text-red-300 font-mono">
                    {formatPct(row.stats?.upper_2sd ?? null)}
                  </td>
                  <td className="px-3 py-2 text-right text-orange-300 font-mono">
                    {formatPct(row.stats?.upper_1sd ?? null)}
                  </td>
                  <td className="px-3 py-2 text-right text-green-300 font-mono">
                    {formatPct(row.stats?.lower_1sd ?? null)}
                  </td>
                  <td className="px-3 py-2 text-right text-emerald-300 font-mono">
                    {formatPct(row.stats?.lower_2sd ?? null)}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-400 font-mono">
                    {formatPct(row.stats?.std ?? null)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="px-4 py-1.5 text-xs bg-slate-800 text-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-700 disabled:cursor-not-allowed"
          >
            ← Previous
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const pageNum =
                totalPages <= 7
                  ? i
                  : page < 4
                  ? i
                  : page > totalPages - 5
                  ? totalPages - 7 + i
                  : page - 3 + i
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-7 h-7 text-xs rounded ${
                    pageNum === page
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {pageNum + 1}
                </button>
              )
            })}
          </div>
          <button
            disabled={page === totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="px-4 py-1.5 text-xs bg-slate-800 text-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-700 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      )}

      {/* Legend */}
      <div className="text-xs text-slate-600 flex flex-wrap gap-4">
        <span><span className="text-green-400">Green</span> = Finserv at a discount to its stake value</span>
        <span><span className="text-red-400">Red</span> = Finserv at a premium to its stake value</span>
        <span>SD bands on {rollingMode ? 'rolling' : 'fixed'} {selectedWindow} window · Stake = end-of-quarter BSE disclosure</span>
      </div>
    </div>
  )
}
