'use client'

import { useState, useMemo, useEffect } from 'react'
import type { SpreadPoint, WindowKey, TradingRules } from '@/types'
import type { GrasimRawPoint, GrasimStakeRow, GrasimSubsidiary, GrasimLiveData } from '@/types/grasim'
import { GRASIM_DEFAULT_SELECTION } from '@/types/grasim'
import { recomputeGrasimSpread } from '@/lib/grasim-spread-calculator'
import GrasimLiveBanner from './GrasimLiveBanner'
import SubsidiarySelector from './SubsidiarySelector'
import SpreadChart from './SpreadChart'
import StatisticsPanel from './StatisticsPanel'

type Tab = 'dashboard' | 'daily-spread'

interface Props {
  rawPoints: GrasimRawPoint[]
  stakes: GrasimStakeRow[]
  spreadSeries: SpreadPoint[]          // precomputed for GRASIM_DEFAULT_SELECTION
  initialLiveData: GrasimLiveData | null
  rules: TradingRules
}

export default function GrasimDashboard({
  rawPoints,
  stakes,
  spreadSeries: initialSpreadSeries,
  initialLiveData,
  rules,
}: Props) {
  const [selectedWindow, setSelectedWindow] = useState<WindowKey>('2Y')
  const [selectedCompanies, setSelectedCompanies] = useState<GrasimSubsidiary[]>(GRASIM_DEFAULT_SELECTION)
  const [liveData, setLiveData] = useState<GrasimLiveData | null>(initialLiveData)
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [rollingMode, setRollingMode] = useState(false)
  const [lightMode, setLightMode] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem('theme')
    const isLight = saved !== 'dark'
    setLightMode(isLight)
    if (isLight) document.documentElement.classList.add('light')
    else document.documentElement.classList.remove('light')
  }, [])

  function toggleTheme() {
    const next = !lightMode
    setLightMode(next)
    localStorage.setItem('theme', next ? 'light' : 'dark')
    if (next) document.documentElement.classList.add('light')
    else document.documentElement.classList.remove('light')
  }

  // Recompute spread client-side whenever subsidiary selection changes
  const activeSpreadSeries = useMemo(
    () => recomputeGrasimSpread(rawPoints, stakes, selectedCompanies),
    [rawPoints, stakes, selectedCompanies]
  )

  const liveSpreadPct = liveData?.spread_pct

  const tabs: { id: Tab; label: string }[] = [
    { id: 'dashboard',    label: 'Dashboard' },
    { id: 'daily-spread', label: 'Daily Spread' },
  ]

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-white">Grasim Industries — Pair Trade</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Residual = Grasim MCap − Σ (stake × subsidiary MCap)
            </p>
          </div>
          <div className="flex items-center gap-3">
            <SubsidiarySelector
              selected={selectedCompanies}
              onChange={setSelectedCompanies}
              stakes={stakes}
            />
            <button
              onClick={() => setRollingMode((v) => !v)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                rollingMode
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'border-slate-600 text-slate-400 hover:border-slate-400'
              }`}
            >
              {rollingMode ? 'Rolling' : 'Fixed'}
            </button>
            <button
              onClick={toggleTheme}
              className="px-3 py-1.5 rounded-lg border border-slate-600 text-slate-400 text-xs hover:border-slate-400 transition-colors"
            >
              {lightMode ? 'Dark' : 'Light'}
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-slate-700">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'dashboard' && (
          <div className="space-y-4">
            <GrasimLiveBanner
              selectedCompanies={selectedCompanies}
              rollingMode={rollingMode}
              initialData={liveData}
              spreadSeries={activeSpreadSeries}
              selectedWindow={selectedWindow}
              onDataLoaded={setLiveData}
              rules={rules}
            />
            <SpreadChart
              series={activeSpreadSeries}
              selectedWindow={selectedWindow}
              onWindowChange={setSelectedWindow}
              liveSpreadPct={liveSpreadPct}
              rollingMode={rollingMode}
              lightMode={lightMode}
            />
            <StatisticsPanel
              series={activeSpreadSeries}
              selectedWindow={selectedWindow}
              liveSpreadPct={liveSpreadPct}
              rollingMode={rollingMode}
              rules={rules}
            />
          </div>
        )}

        {activeTab === 'daily-spread' && (
          <GrasimDailySpreadTable series={activeSpreadSeries} selectedWindow={selectedWindow} />
        )}
      </div>
    </div>
  )
}

// Minimal daily spread table for Grasim — no stake editing needed
function GrasimDailySpreadTable({
  series,
  selectedWindow,
}: {
  series: SpreadPoint[]
  selectedWindow: WindowKey
}) {
  const sorted = [...series].reverse() // newest first

  function fmt(n: number | null, d = 2) {
    if (n == null) return '—'
    return n.toFixed(d)
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/30 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400">
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-right px-4 py-3 font-medium">Grasim MCap</th>
              <th className="text-right px-4 py-3 font-medium">Basket MCap</th>
              <th className="text-right px-4 py-3 font-medium">Residual</th>
              <th className="text-right px-4 py-3 font-medium">Spread %</th>
              <th className="text-right px-4 py-3 font-medium">Z ({selectedWindow})</th>
              <th className="text-right px-4 py-3 font-medium">Pctile</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const ws = p.windows[selectedWindow]
              const z = ws?.zscore ?? null
              const zColor =
                z == null ? '' :
                z <= -1.5 ? 'text-green-400' :
                z >= 1.5  ? 'text-red-400' :
                z <= -1   ? 'text-green-300/70' :
                z >= 1    ? 'text-red-300/70' : 'text-slate-300'
              return (
                <tr key={p.date} className="border-b border-slate-700/40 hover:bg-slate-700/20 transition-colors">
                  <td className="px-4 py-2 text-slate-300 font-mono">{p.date}</td>
                  <td className="px-4 py-2 text-right text-slate-300">
                    {p.finsv_mcap >= 100000
                      ? `₹${(p.finsv_mcap / 100000).toFixed(1)}L cr`
                      : `₹${(p.finsv_mcap / 1000).toFixed(0)}k cr`}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-300">
                    {p.fin_mcap >= 100000
                      ? `₹${(p.fin_mcap / 100000).toFixed(1)}L cr`
                      : `₹${(p.fin_mcap / 1000).toFixed(0)}k cr`}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-300">
                    {p.residual_value >= 0
                      ? `₹${(p.residual_value / 1000).toFixed(0)}k cr`
                      : `-₹${(Math.abs(p.residual_value) / 1000).toFixed(0)}k cr`}
                  </td>
                  <td className="px-4 py-2 text-right text-white font-mono">{fmt(p.spread_pct)}%</td>
                  <td className={`px-4 py-2 text-right font-mono ${zColor}`}>{fmt(z)}</td>
                  <td className="px-4 py-2 text-right text-slate-400">{ws?.percentile_rank != null ? Math.round(ws.percentile_rank) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
