'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import type { SpreadPoint, WindowKey, TradingRules } from '@/types'
import { WINDOW_MONTHS } from '@/types'
import type { GrasimRawPoint, GrasimStakeRow, GrasimSubsidiary, GrasimLiveData } from '@/types/grasim'
import { GRASIM_DEFAULT_SELECTION } from '@/types/grasim'
import { recomputeGrasimSpread } from '@/lib/grasim-spread-calculator'
import { getLocalRuleOverrides, hasLocalOverrides } from '@/lib/local-rules'
import { subtractMonths, computeFixedWindowStats } from '@/lib/spread-calculator'
import GrasimLiveBanner from './GrasimLiveBanner'
import SubsidiarySelector from './SubsidiarySelector'
import SpreadChart from './SpreadChart'
import StatisticsPanel from './StatisticsPanel'
import RulesTab from './RulesTab'
import ActiveTradeTab from './ActiveTradeTab'
import GrasimTradeSetupTab from './GrasimTradeSetupTab'
import GrasimSharesTab from './GrasimSharesTab'
import PairSwitcher from './PairSwitcher'
import GrasimDailySpreadTable from './GrasimDailySpreadTable'
import ForwardReturnsTable from './ForwardReturnsTable'
import ForwardReturnObservations from './ForwardReturnObservations'

type Tab = 'dashboard' | 'daily-spread' | 'rules' | 'active-trade' | 'trade-setup' | 'shares'

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
  rules: initialRules,
}: Props) {
  const [selectedWindow, setSelectedWindow] = useState<WindowKey>('2Y')
  const [selectedCompanies, setSelectedCompanies] = useState<GrasimSubsidiary[]>(GRASIM_DEFAULT_SELECTION)
  const [liveData, setLiveData] = useState<GrasimLiveData | null>(initialLiveData)
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [rollingMode, setRollingMode] = useState(false)
  const [lightMode, setLightMode] = useState(true)

  // Editable stakes — drives spread recompute when user saves changes
  const [currentStakes, setCurrentStakes] = useState<GrasimStakeRow[]>(stakes)

  // Rules state
  const [activeRules, setActiveRules] = useState<TradingRules>(initialRules)
  const [isOwner, setIsOwner] = useState(false)
  const [hasOverrides, setHasOverrides] = useState(false)
  const [zOverride, setZOverride] = useState<number | null>(initialRules.z_override ?? null)
  const dbRulesRef = useRef<TradingRules>(initialRules)

  // Analog Observations / Forward Returns filter state
  const [obsFilterYear,  setObsFilterYear]  = useState<number | null>(2022)
  const [obsFilterMonth, setObsFilterMonth] = useState<number>(0)
  const [dirOverride,    setDirOverride]    = useState<'long' | 'short' | null>(null)

  const obsStartDate = obsFilterYear != null
    ? `${obsFilterYear}-${String(obsFilterMonth + 1).padStart(2, '0')}-01`
    : null

  useEffect(() => {
    const saved = localStorage.getItem('theme')
    const isLight = saved !== 'dark'
    setLightMode(isLight)
    if (isLight) document.documentElement.classList.add('light')
    else document.documentElement.classList.remove('light')

    // Detect owner via probe PATCH (empty array → 200 if owner, 403 if visitor)
    fetch('/api/grasim/rules', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([]),
    }).then(r => setIsOwner(r.ok)).catch(() => {})

    // Merge DB rules + localStorage grasim overrides
    const overrides = getLocalRuleOverrides('grasim_rule_overrides')
    if (Object.keys(overrides).length > 0) {
      setActiveRules({ ...initialRules, ...overrides })
      setHasOverrides(true)
    }

    // Poll rules every 60s
    const rulesInterval = setInterval(async () => {
      try {
        const r = await fetch('/api/grasim/rules')
        if (!r.ok) return
        const updated: TradingRules = await r.json()
        dbRulesRef.current = updated
        setActiveRules(() => {
          const localOverrides = getLocalRuleOverrides('grasim_rule_overrides')
          return { ...updated, ...localOverrides }
        })
        setZOverride(updated.z_override ?? null)
      } catch { /* ignore */ }
    }, 60_000)

    return () => clearInterval(rulesInterval)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleTheme() {
    const next = !lightMode
    setLightMode(next)
    localStorage.setItem('theme', next ? 'light' : 'dark')
    if (next) document.documentElement.classList.add('light')
    else document.documentElement.classList.remove('light')
  }

  function handleRulesChange(updated: TradingRules) {
    setActiveRules(updated)
    setHasOverrides(hasLocalOverrides('grasim_rule_overrides'))
  }

  function handleResetRules() {
    setActiveRules(dbRulesRef.current)
    setHasOverrides(false)
    import('@/lib/local-rules').then(m => m.clearLocalRuleOverrides('grasim_rule_overrides'))
  }

  // Recompute spread client-side whenever subsidiary selection OR stakes change
  const activeSpreadSeries = useMemo(
    () => recomputeGrasimSpread(rawPoints, currentStakes, selectedCompanies),
    [rawPoints, currentStakes, selectedCompanies]
  )

  // Compute current Z-score from the selected window
  const currentZ = useMemo(() => {
    const last = activeSpreadSeries[activeSpreadSeries.length - 1]
    if (!last) return null
    const spread = liveData?.spread_pct ?? last.spread_pct
    const visibleValues = selectedWindow === 'ALL'
      ? activeSpreadSeries.map(p => p.spread_pct)
      : activeSpreadSeries
          .filter(p => p.date >= subtractMonths(last.date, WINDOW_MONTHS[selectedWindow]!))
          .map(p => p.spread_pct)
    return computeFixedWindowStats(visibleValues, spread).zscore
  }, [activeSpreadSeries, selectedWindow, liveData])

  const effectiveZ = zOverride !== null ? zOverride : currentZ

  const liveSpreadPct = liveData?.spread_pct

  const tabs: { id: Tab; label: string }[] = [
    { id: 'dashboard',    label: 'Dashboard' },
    { id: 'daily-spread', label: 'Daily Spread' },
    { id: 'rules',        label: 'Rules' },
    { id: 'active-trade', label: 'Active Trade' },
    { id: 'trade-setup',  label: 'Trade Setup' },
    { id: 'shares',       label: 'Shares' },
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
          <div className="flex items-center gap-3 flex-wrap">
            {hasOverrides && (
              <button
                onClick={handleResetRules}
                className="text-xs px-3 py-1 rounded-full border border-amber-600 bg-amber-600/10 text-amber-400 hover:bg-amber-600/20 transition-colors"
                title="Clear your local rule overrides and restore original rules"
              >
                Reset Rules
              </button>
            )}
            <SubsidiarySelector
              selected={selectedCompanies}
              onChange={setSelectedCompanies}
              stakes={currentStakes}
            />
            <PairSwitcher currentPair="grasim" />
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
        <div className="flex gap-1 border-b border-slate-700 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
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
              rules={activeRules}
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
              rules={activeRules}
            />
            <ForwardReturnsTable
              series={activeSpreadSeries}
              selectedWindow={selectedWindow}
              liveSpreadPct={liveSpreadPct}
              rollingMode={rollingMode}
              rules={activeRules}
              obsStartDate={obsStartDate}
              zOverride={zOverride}
              dirOverride={dirOverride}
            />
            <ForwardReturnObservations
              series={activeSpreadSeries}
              selectedWindow={selectedWindow}
              liveSpreadPct={liveSpreadPct}
              rollingMode={rollingMode}
              rules={activeRules}
              filterYear={obsFilterYear}
              filterMonth={obsFilterMonth}
              onFilterChange={(year, month) => { setObsFilterYear(year); setObsFilterMonth(month) }}
              zOverride={zOverride}
              onZOverrideChange={(v) => {
                setZOverride(v)
                if (v == null) setDirOverride(null)
                if (isOwner) {
                  fetch('/api/grasim/rules', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify([{ rule_key: 'z_override', rule_value: v ?? 999 }]),
                  }).catch(() => {})
                }
              }}
              dirOverride={dirOverride}
              onDirOverrideChange={setDirOverride}
            />
          </div>
        )}

        {activeTab === 'daily-spread' && (
          <GrasimDailySpreadTable
            series={activeSpreadSeries}
            rawPoints={rawPoints}
            stakes={currentStakes}
            rollingMode={rollingMode}
            onStakesChange={setCurrentStakes}
            externalWindow={selectedWindow}
          />
        )}

        {activeTab === 'rules' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">Trading Rules</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isOwner
                    ? 'Owner mode · Changes save to database and affect all users.'
                    : 'Visitor mode · Changes are stored locally in your browser only and do not affect other users.'}
                </p>
              </div>
              {hasOverrides && !isOwner && (
                <button
                  onClick={handleResetRules}
                  className="text-xs px-3 py-1 rounded border border-amber-600 bg-amber-600/10 text-amber-400 hover:bg-amber-600/20 transition-colors"
                >
                  Reset to defaults
                </button>
              )}
            </div>
            <RulesTab
              rules={activeRules}
              isOwner={isOwner}
              onRulesChange={handleRulesChange}
              apiPath="/api/grasim/rules"
              storageKey="grasim_rule_overrides"
            />
          </div>
        )}

        {activeTab === 'active-trade' && (
          <ActiveTradeTab
            series={activeSpreadSeries}
            selectedWindow={selectedWindow}
            liveSpreadPct={liveSpreadPct}
            rules={activeRules}
            isOwner={isOwner}
            onOwnerUnlock={() => setIsOwner(true)}
            apiPath="/api/grasim/trades"
          />
        )}

        {activeTab === 'trade-setup' && (
          <GrasimTradeSetupTab
            liveData={liveData}
            currentZ={effectiveZ}
            selectedCompanies={selectedCompanies}
          />
        )}

        {activeTab === 'shares' && (
          <GrasimSharesTab />
        )}

        <footer className="text-center text-xs text-slate-700 pb-6">
          Live prices from Dhan API · Historical data in Supabase · Refreshes every 60s
        </footer>
      </div>
    </div>
  )
}
