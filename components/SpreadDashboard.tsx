'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import type { SpreadPoint, StakeHistoryRow, WindowKey, LiveSpreadData, TradingRules } from '@/types'
import { recomputeSpreadSeries } from '@/lib/spread-calculator'
import { getLocalRuleOverrides, clearLocalRuleOverrides, hasLocalOverrides } from '@/lib/local-rules'
import LiveSpreadBanner from './LiveSpreadBanner'
import SpreadChart from './SpreadChart'
import StatisticsPanel from './StatisticsPanel'
import ForwardReturnsTable from './ForwardReturnsTable'
import ForwardReturnObservations from './ForwardReturnObservations'
import DailySpreadTable from './DailySpreadTable'
import SharesTab from './SharesTab'
import RulesTab from './RulesTab'
import ActiveTradeTab from './ActiveTradeTab'

type Tab = 'dashboard' | 'daily-spread' | 'shares' | 'rules' | 'active-trade'

interface Props {
  spreadSeries: SpreadPoint[]
  stakes: StakeHistoryRow[]
  initialLiveData: LiveSpreadData | null
  rules: TradingRules
}

export default function SpreadDashboard({ spreadSeries, stakes, initialLiveData, rules: initialRules }: Props) {
  const [selectedWindow, setSelectedWindow] = useState<WindowKey>('2Y')
  const [liveData, setLiveData] = useState<LiveSpreadData | null>(initialLiveData)
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [rollingMode, setRollingMode] = useState(false)
  const [lightMode, setLightMode] = useState(false)
  const [currentStakes, setCurrentStakes] = useState<StakeHistoryRow[]>(stakes)
  const [activeRules, setActiveRules] = useState<TradingRules>(initialRules)
  const [hasOverrides, setHasOverrides] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [obsFilterYear, setObsFilterYear] = useState<number | null>(2022)
  const [obsFilterMonth, setObsFilterMonth] = useState<number>(0) // Jan
  const [zOverride, setZOverride] = useState<number | null>(null)
  const [dirOverride, setDirOverride] = useState<'long' | 'short' | null>(null)

  // Store the DB-fetched rules so we can always reset back to them
  const dbRulesRef = useRef<TradingRules>(initialRules)

  const obsStartDate = obsFilterYear != null
    ? `${obsFilterYear}-${String(obsFilterMonth + 1).padStart(2, '0')}-01`
    : null

  const activeSpreadSeries = useMemo(
    () => recomputeSpreadSeries(spreadSeries, currentStakes),
    [spreadSeries, currentStakes]
  )

  useEffect(() => {
    setLightMode(document.documentElement.classList.contains('light'))

    // Detect owner cookie via a lightweight fetch (cookie is HttpOnly, can't read from JS)
    fetch('/api/auth/verify-owner', { method: 'HEAD' }).catch(() => {})
    // Instead, detect by trying to write a rule and checking if the response is 403
    // We use a separate flag endpoint instead — detect from the cookie header presence via document.cookie
    // bajaj_owner is HttpOnly so we can't read it directly. We use a test fetch on mount.
    fetch('/api/rules', { method: 'GET' }).then(async (r) => {
      if (r.ok) {
        // Try a no-op PATCH with empty array — 403 = visitor, 200 = owner
        const probe = await fetch('/api/rules', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([]),
        })
        setIsOwner(probe.ok)
      }
    }).catch(() => {})

    // Merge DB rules + localStorage overrides
    const overrides = getLocalRuleOverrides()
    if (Object.keys(overrides).length > 0) {
      setActiveRules({ ...initialRules, ...overrides })
      setHasOverrides(true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleResetRules() {
    clearLocalRuleOverrides()
    setActiveRules(dbRulesRef.current)
    setHasOverrides(false)
  }

  function handleRulesChange(updated: TradingRules) {
    setActiveRules(updated)
    setHasOverrides(hasLocalOverrides())
  }

  function toggleTheme() {
    const next = !lightMode
    setLightMode(next)
    if (next) {
      document.documentElement.classList.add('light')
      localStorage.setItem('theme', 'light')
    } else {
      document.documentElement.classList.remove('light')
      localStorage.setItem('theme', 'dark')
    }
  }

  const liveSpreadPct = liveData?.spread_pct

  const TAB_STYLE = (tab: Tab) =>
    `px-4 py-1.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
      activeTab === tab
        ? 'border-blue-500 text-white bg-slate-900'
        : 'border-transparent text-slate-500 hover:text-slate-300'
    }`

  if (spreadSeries.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-2xl font-bold text-slate-300">No price data yet</div>
          <p className="text-slate-500 max-w-md">
            Seed historical prices by sending a POST request to{' '}
            <code className="bg-slate-800 px-2 py-1 rounded text-blue-400">/api/prices/seed</code>
            {' '}with header{' '}
            <code className="bg-slate-800 px-2 py-1 rounded text-blue-400">x-cron-secret: YOUR_SECRET</code>
          </p>
          <div className="text-xs text-slate-600 mt-2">
            The seed will fetch 6 years of historical data from Yahoo Finance and store it in Supabase.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">
              BAJAJ PAIR TRADE
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Bajaj Finserv / Bajaj Finance · Implied Residual Value Framework · Tusk Investments
            </p>
          </div>
          <div className="flex items-center gap-3">
            {hasOverrides && (
              <button
                onClick={handleResetRules}
                className="text-xs px-3 py-1 rounded-full border border-amber-600 bg-amber-600/10 text-amber-400 hover:bg-amber-600/20 transition-colors"
                title="Clear your local rule overrides and restore original rules"
              >
                Reset Rules
              </button>
            )}
            <button
              onClick={() => setRollingMode(r => !r)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                rollingMode
                  ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                  : 'border-slate-600 bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {rollingMode ? 'Rolling Mean: ON' : 'Rolling Mean: OFF'}
            </button>
            <button
              onClick={toggleTheme}
              className="text-xs px-3 py-1 rounded-full border border-slate-600 bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
              title={lightMode ? 'Switch to dark mode' : 'Switch to light mode'}
            >
              {lightMode ? '🌙 Dark' : '☀️ Light'}
            </button>
            <div className="text-xs text-slate-600">
              {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </div>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="max-w-screen-2xl mx-auto mt-3 flex gap-1">
          <button onClick={() => setActiveTab('dashboard')} className={TAB_STYLE('dashboard')}>
            Dashboard
          </button>
          <button onClick={() => setActiveTab('daily-spread')} className={TAB_STYLE('daily-spread')}>
            Daily Spread
          </button>
          <button onClick={() => setActiveTab('shares')} className={TAB_STYLE('shares')}>
            Shares
          </button>
          <button onClick={() => setActiveTab('rules')} className={TAB_STYLE('rules')}>
            Rules {hasOverrides && <span className="ml-1 text-amber-400">●</span>}
          </button>
          <button onClick={() => setActiveTab('active-trade')} className={TAB_STYLE('active-trade')}>
            Active Trade
          </button>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-6 py-6 space-y-6">
        {activeTab === 'dashboard' && (
          <>
            {/* Live Banner */}
            <LiveSpreadBanner
              initialData={liveData}
              spreadSeries={activeSpreadSeries}
              selectedWindow={selectedWindow}
              rollingMode={rollingMode}
              onDataLoaded={setLiveData}
              rules={activeRules}
            />

            {/* Chart + Stats */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="xl:col-span-2">
                <SpreadChart
                  series={activeSpreadSeries}
                  selectedWindow={selectedWindow}
                  onWindowChange={setSelectedWindow}
                  liveSpreadPct={liveSpreadPct}
                  rollingMode={rollingMode}
                  lightMode={lightMode}
                />
              </div>
              <div>
                <StatisticsPanel
                  series={activeSpreadSeries}
                  selectedWindow={selectedWindow}
                  liveSpreadPct={liveSpreadPct}
                  rollingMode={rollingMode}
                  rules={activeRules}
                />
              </div>
            </div>

            {/* Forward Returns */}
            <ForwardReturnsTable
              series={activeSpreadSeries}
              selectedWindow={selectedWindow}
              dirOverride={dirOverride}
              liveSpreadPct={liveSpreadPct}
              rollingMode={rollingMode}
              rules={activeRules}
              obsStartDate={obsStartDate}
              zOverride={zOverride}
            />

            {/* Analog Observations */}
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
              onZOverrideChange={(v) => { setZOverride(v); if (v == null) setDirOverride(null) }}
              dirOverride={dirOverride}
              onDirOverrideChange={setDirOverride}
            />
          </>
        )}

        {activeTab === 'daily-spread' && (
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-white">Daily Spread History</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Historical spread between Bajaj Finserv market cap and its implied stake value in Bajaj Finance.
                Negative spread = Finserv trades at a discount to its stake.
              </p>
            </div>
            <DailySpreadTable
              spreadSeries={activeSpreadSeries}
              stakes={currentStakes}
              rollingMode={rollingMode}
              onStakesChange={setCurrentStakes}
              externalWindow={selectedWindow}
            />
          </div>
        )}

        {activeTab === 'shares' && (
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
            <SharesTab />
          </div>
        )}

        {activeTab === 'rules' && (
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
            <div className="mb-5">
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
            </div>
            <RulesTab
              rules={activeRules}
              isOwner={isOwner}
              onRulesChange={handleRulesChange}
            />
          </div>
        )}

        {activeTab === 'active-trade' && (
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
            <ActiveTradeTab
              series={activeSpreadSeries}
              selectedWindow={selectedWindow}
              liveSpreadPct={liveSpreadPct}
              rules={activeRules}
              isOwner={isOwner}
              onOwnerUnlock={() => {
                setIsOwner(true)
              }}
            />
          </div>
        )}

        <footer className="text-center text-xs text-slate-700 pb-6">
          Live prices from Dhan API · Historical data in Supabase · Refreshes every 60s
        </footer>
      </main>
    </div>
  )
}
