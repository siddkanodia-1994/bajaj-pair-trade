'use client'

import { useState, useMemo, useEffect } from 'react'
import type { SpreadPoint, WindowKey, WindowStats } from '@/types'
import { WINDOW_MONTHS, WINDOW_KEYS } from '@/types'
import type { GrasimRawPoint, GrasimStakeRow } from '@/types/grasim'
import { calendarRollingStats, computeFixedWindowStats, subtractMonths, getQuarterEndDate } from '@/lib/spread-calculator'

interface Props {
  series: SpreadPoint[]
  rawPoints: GrasimRawPoint[]
  stakes: GrasimStakeRow[]
  rollingMode: boolean
  onStakesChange: (updated: GrasimStakeRow[]) => void
  externalWindow?: WindowKey
}

// Subsidiary columns in the stakes matrix
const SUB_COMPANIES = ['ULTRACEMCO', 'ABCAPITAL', 'IDEA', 'HINDALCO', 'ABFRL', 'ABLBL'] as const
type SubCompany = typeof SUB_COMPANIES[number]

const SUB_SHORT: Record<SubCompany, string> = {
  ULTRACEMCO: 'UltraTech',
  ABCAPITAL:  'AB Capital',
  IDEA:       'Idea',
  HINDALCO:   'Hindalco',
  ABFRL:      'ABFRL',
  ABLBL:      'ABLBL',
}

const PAGE_SIZE = 100

function fmtQuarter(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  const month = d.getMonth()
  const year = d.getFullYear()
  if (month >= 3 && month <= 5) return `Q1 FY${String(year + 1).slice(2)}`
  if (month >= 6 && month <= 8) return `Q2 FY${String(year + 1).slice(2)}`
  if (month >= 9 && month <= 11) return `Q3 FY${String(year + 1).slice(2)}`
  return `Q4 FY${String(year).slice(2)}`
}

function formatCr(v: number | null): string {
  if (v === null || isNaN(v)) return '—'
  return v.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

function formatPct(v: number | null, digits = 2): string {
  if (v === null || isNaN(v)) return '—'
  return v.toFixed(digits) + '%'
}

interface DisplayRow {
  date: string
  grasim_mcap: number    // finsv_mcap in SpreadPoint
  basket_mcap: number    // fin_mcap in SpreadPoint
  residual_value: number
  spread_pct: number
  grasim_price: number | null
  stats: WindowStats
  zscore: number | null
}

export default function GrasimDailySpreadTable({
  series,
  rawPoints,
  stakes,
  rollingMode,
  onStakesChange,
  externalWindow,
}: Props) {
  const [stakeEditorOpen, setStakeEditorOpen] = useState(false)
  const [selectedWindow, setSelectedWindow] = useState<WindowKey>(externalWindow ?? '1Y')
  useEffect(() => { if (externalWindow) setSelectedWindow(externalWindow) }, [externalWindow])
  const [showGrasimPrice, setShowGrasimPrice] = useState(false)
  const [page, setPage] = useState(0)
  const [sortDesc, setSortDesc] = useState(true)

  // Build a lookup for grasim_price by date
  const priceByDate = useMemo(() => {
    const map: Record<string, number> = {}
    for (const rp of rawPoints) map[rp.date] = rp.grasim_price
    return map
  }, [rawPoints])

  // --- Stakes editor state ---
  // Unique quarter dates (DB only)
  const quarterDates = useMemo(() => {
    const set = new Set(stakes.map((s) => s.quarter_end_date))
    return [...set].sort((a, b) => b.localeCompare(a)) // newest first
  }, [stakes])

  // Auto-inject current quarter as placeholder if not yet in DB
  const currentQE = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    return getQuarterEndDate(today)
  }, [])

  const isPlaceholderQuarter = useMemo(
    () => !stakes.some(s => s.quarter_end_date === currentQE),
    [stakes, currentQE]
  )

  const effectiveQuarterDates = useMemo(() => {
    if (!isPlaceholderQuarter) return quarterDates
    return [currentQE, ...quarterDates]
  }, [quarterDates, isPlaceholderQuarter, currentQE])

  // editValues: { 'quarter|company': '56.70' }
  const [editValues, setEditValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const s of stakes) init[`${s.quarter_end_date}|${s.company}`] = String(s.stake_pct)
    return init
  })

  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Sync editValues when stakes prop changes; also seed placeholder quarter from prior quarter
  useEffect(() => {
    setEditValues((prev) => {
      const next = { ...prev }
      // Sync existing DB stakes
      for (const s of stakes) {
        const k = `${s.quarter_end_date}|${s.company}`
        if (!(k in next)) next[k] = String(s.stake_pct)
      }
      // Seed placeholder quarter with most recent prior quarter values
      const needsPlaceholder = !stakes.some(s => s.quarter_end_date === currentQE)
      if (needsPlaceholder) {
        const priorQE = quarterDates[0] // most recent existing quarter
        for (const c of SUB_COMPANIES) {
          const k = `${currentQE}|${c}`
          if (!(k in next) && priorQE) {
            const priorVal = stakes.find(s => s.quarter_end_date === priorQE && s.company === c)?.stake_pct
            next[k] = priorVal != null ? String(priorVal) : ''
          }
        }
      }
      return next
    })
  }, [stakes, quarterDates, currentQE])

  function getEditVal(qe: string, company: string): string {
    return editValues[`${qe}|${company}`] ?? ''
  }

  function setEditVal(qe: string, company: string, val: string) {
    setEditValues((prev) => ({ ...prev, [`${qe}|${company}`]: val }))
    setErrors((prev) => ({ ...prev, [qe]: '' }))
  }

  function isRowDirty(qe: string): boolean {
    const isNew = !stakes.some(s => s.quarter_end_date === qe)
    for (const c of SUB_COMPANIES) {
      const raw = parseFloat(getEditVal(qe, c))
      if (isNew) {
        if (!isNaN(raw)) return true // any filled value = dirty for new placeholder row
      } else {
        const current = stakes.find((s) => s.quarter_end_date === qe && s.company === c)?.stake_pct
        if (!isNaN(raw) && current !== undefined && raw !== current) return true
      }
    }
    return false
  }

  async function handleSave(qe: string) {
    // Validate all 6 values for this quarter
    const rows: { quarter_end_date: string; company: string; stake_pct: number }[] = []
    for (const c of SUB_COMPANIES) {
      const raw = getEditVal(qe, c)
      const val = parseFloat(raw)
      if (raw !== '' && (isNaN(val) || val < 0 || val > 100)) {
        setErrors((e) => ({ ...e, [qe]: `${c}: must be 0–100` }))
        return
      }
      if (raw !== '') rows.push({ quarter_end_date: qe, company: c, stake_pct: val })
    }
    if (rows.length === 0) return
    setErrors((e) => ({ ...e, [qe]: '' }))
    setSaving((s) => ({ ...s, [qe]: true }))

    try {
      const res = await fetch('/api/grasim/stakes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      if (!res.ok) {
        const err = await res.json()
        setErrors((e) => ({ ...e, [qe]: err.error ?? 'Save failed' }))
        return
      }
      // Propagate updated stakes to parent → triggers recompute
      const updatedStakes = stakes.map((s) => {
        const match = rows.find((r) => r.quarter_end_date === s.quarter_end_date && r.company === s.company)
        return match ? { ...s, stake_pct: match.stake_pct } : s
      })
      // Add any new rows not previously in stakes
      for (const r of rows) {
        const exists = updatedStakes.some((s) => s.quarter_end_date === r.quarter_end_date && s.company === r.company)
        if (!exists) updatedStakes.push({ quarter_end_date: r.quarter_end_date, company: r.company, stake_pct: r.stake_pct, source: 'manual' })
      }
      onStakesChange(updatedStakes)
    } catch {
      setErrors((e) => ({ ...e, [qe]: 'Network error' }))
    } finally {
      setSaving((s) => ({ ...s, [qe]: false }))
    }
  }

  // --- Display rows ---
  const displayRows: DisplayRow[] = useMemo(() => {
    const dates = series.map((p) => p.date)
    const spreadValues = series.map((p) => p.spread_pct)
    const monthsOrAll: number | 'ALL' = selectedWindow === 'ALL' ? 'ALL' : (WINDOW_MONTHS[selectedWindow] ?? 12)
    const statsArr = calendarRollingStats(dates, spreadValues, monthsOrAll)

    const fixedStats = !rollingMode
      ? (() => {
          const lastDate = dates[dates.length - 1] ?? ''
          const windowValues = selectedWindow === 'ALL'
            ? spreadValues
            : spreadValues.filter((_, i) => dates[i] >= subtractMonths(lastDate, WINDOW_MONTHS[selectedWindow]!))
          return computeFixedWindowStats(windowValues)
        })()
      : null

    const rows: DisplayRow[] = series.map((p, i) => {
      const stats = fixedStats ?? statsArr[i]
      const zscore = fixedStats != null && fixedStats.mean != null && fixedStats.std != null && fixedStats.std > 0
        ? (p.spread_pct - fixedStats.mean) / fixedStats.std
        : stats.zscore ?? null
      return {
        date: p.date,
        grasim_mcap: p.finsv_mcap,
        basket_mcap: p.fin_mcap,
        residual_value: p.residual_value,
        spread_pct: p.spread_pct,
        grasim_price: priceByDate[p.date] ?? null,
        stats,
        zscore,
      }
    })

    rows.sort((a, b) => sortDesc ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date))
    return rows
  }, [series, selectedWindow, sortDesc, rollingMode, priceByDate])

  const totalPages = Math.ceil(displayRows.length / PAGE_SIZE)
  const pageRows = displayRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

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
                  <th className="px-3 py-2 text-left text-slate-400 font-medium whitespace-nowrap">Quarter</th>
                  <th className="px-3 py-2 text-left text-slate-400 font-medium whitespace-nowrap">Period End</th>
                  {SUB_COMPANIES.map((c) => (
                    <th key={c} className="px-3 py-2 text-right text-slate-400 font-medium whitespace-nowrap">
                      {SUB_SHORT[c]} %
                    </th>
                  ))}
                  <th className="px-3 py-2 w-20" />
                </tr>
              </thead>
              <tbody>
                {effectiveQuarterDates.map((qe) => {
                  const isSaving = saving[qe]
                  const err = errors[qe]
                  const dirty = isRowDirty(qe)
                  const isNew = isPlaceholderQuarter && qe === currentQE

                  return (
                    <tr key={qe} className="border-b border-slate-700/50 hover:bg-slate-800/30">
                      <td className="px-3 py-2 text-slate-300 font-medium whitespace-nowrap">
                        {fmtQuarter(qe)}
                        {isNew && <span className="ml-2 text-xs text-blue-400 font-normal italic">new</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-400 whitespace-nowrap">
                        {new Date(qe + 'T00:00:00').toLocaleDateString('en-IN', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })}
                      </td>
                      {SUB_COMPANIES.map((c) => (
                        <td key={c} className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              value={getEditVal(qe, c)}
                              onChange={(e) => setEditVal(qe, c, e.target.value)}
                              className="w-20 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-right text-white focus:outline-none focus:border-blue-500 text-xs"
                            />
                            <span className="text-slate-500">%</span>
                          </div>
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => handleSave(qe)}
                          disabled={isSaving || !dirty}
                          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                            isSaving
                              ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                              : dirty
                              ? 'bg-blue-600 text-white hover:bg-blue-500'
                              : 'bg-slate-800 text-slate-600 cursor-not-allowed'
                          }`}
                        >
                          {isSaving ? 'Saving…' : 'Save'}
                        </button>
                        {err && <div className="text-red-400 text-xs mt-0.5 text-right whitespace-nowrap">{err}</div>}
                      </td>
                    </tr>
                  )
                })}
                {quarterDates.length === 0 && (
                  <tr>
                    <td colSpan={SUB_COMPANIES.length + 3} className="px-4 py-4 text-center text-slate-600">
                      No stake history found
                    </td>
                  </tr>
                )}
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

        {/* Grasim Price toggle */}
        <button
          onClick={() => setShowGrasimPrice((v) => !v)}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            showGrasimPrice
              ? 'border-blue-500 bg-blue-500/10 text-blue-400'
              : 'border-slate-600 bg-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          {showGrasimPrice ? '▾ Hide Price' : '▸ Show Grasim Price'}
        </button>

        <div className="ml-auto text-xs text-slate-500">
          {displayRows.length.toLocaleString()} rows · Page {page + 1}/{Math.max(1, totalPages)}
        </div>
      </div>

      {/* Data Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900">
              <th className="px-3 py-2.5 text-left text-slate-400 font-medium whitespace-nowrap">Date</th>
              <th className="px-3 py-2.5 text-right text-slate-400 font-medium whitespace-nowrap">Spread %</th>
              <th className="px-3 py-2.5 text-right text-purple-400 font-medium whitespace-nowrap">Z-Score ({selectedWindow})</th>
              <th className="px-3 py-2.5 text-right text-slate-400 font-medium whitespace-nowrap">Residual (₹ Cr)</th>
              <th className="px-3 py-2.5 text-right text-slate-400 font-medium whitespace-nowrap">Grasim MCap (₹ Cr)</th>
              <th className="px-3 py-2.5 text-right text-slate-400 font-medium whitespace-nowrap">Basket MCap (₹ Cr)</th>
              {showGrasimPrice && (
                <th className="px-3 py-2.5 text-right text-slate-400 font-medium whitespace-nowrap">Grasim Price (₹)</th>
              )}
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
              const spreadColor = row.spread_pct < 0 ? 'text-green-400' : row.spread_pct > 0 ? 'text-red-400' : 'text-slate-300'
              const residualColor = row.residual_value < 0 ? 'text-green-400' : row.residual_value > 0 ? 'text-red-400' : 'text-slate-300'
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
                  <td className={`px-3 py-2 text-right font-mono font-semibold ${spreadColor}`}>
                    {formatPct(row.spread_pct)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-white">
                    {row.zscore == null ? '—' : `${row.zscore > 0 ? '+' : ''}${row.zscore.toFixed(2)}`}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono ${residualColor}`}>
                    {formatCr(row.residual_value)}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-300 font-mono">
                    {formatCr(row.grasim_mcap)}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-300 font-mono">
                    {formatCr(row.basket_mcap)}
                  </td>
                  {showGrasimPrice && (
                    <td className="px-3 py-2 text-right text-slate-400 font-mono">
                      {row.grasim_price != null && row.grasim_price > 0
                        ? row.grasim_price.toLocaleString('en-IN', { maximumFractionDigits: 2 })
                        : '—'}
                    </td>
                  )}
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
        <span><span className="text-green-400">Green</span> = Grasim at a discount to its implied stake value in subsidiaries</span>
        <span><span className="text-red-400">Red</span> = Grasim at a premium to its implied stake value</span>
        <span>SD bands on {rollingMode ? 'rolling' : 'fixed'} {selectedWindow} window · Stakes = end-of-quarter BSE disclosure</span>
      </div>
    </div>
  )
}
