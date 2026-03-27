'use client'

import { useState, useEffect } from 'react'
import type { SpreadPoint, StakeHistoryRow, WindowKey, LiveSpreadData } from '@/types'
import LiveSpreadBanner from './LiveSpreadBanner'
import SpreadChart from './SpreadChart'
import StatisticsPanel from './StatisticsPanel'
import SignalPanel from './SignalPanel'
import ForwardReturnsTable from './ForwardReturnsTable'
import DailySpreadTable from './DailySpreadTable'
import SharesTab from './SharesTab'

type Tab = 'dashboard' | 'daily-spread' | 'shares'

interface Props {
  spreadSeries: SpreadPoint[]
  stakes: StakeHistoryRow[]
  initialLiveData: LiveSpreadData | null
}

export default function SpreadDashboard({ spreadSeries, stakes, initialLiveData }: Props) {
  const [selectedWindow, setSelectedWindow] = useState<WindowKey>('1Y')
  const [liveData, setLiveData] = useState<LiveSpreadData | null>(initialLiveData)
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [rollingMode, setRollingMode] = useState(true)
  const [lightMode, setLightMode] = useState(false)

  useEffect(() => {
    setLightMode(document.documentElement.classList.contains('light'))
  }, [])

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
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-1.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              activeTab === 'dashboard'
                ? 'border-blue-500 text-white bg-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('daily-spread')}
            className={`px-4 py-1.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              activeTab === 'daily-spread'
                ? 'border-blue-500 text-white bg-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            Daily Spread
          </button>
          <button
            onClick={() => setActiveTab('shares')}
            className={`px-4 py-1.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              activeTab === 'shares'
                ? 'border-blue-500 text-white bg-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            Shares
          </button>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-6 py-6 space-y-6">
        {activeTab === 'dashboard' && (
          <>
            {/* Live Banner */}
            <LiveSpreadBanner
              initialData={liveData}
              spreadSeries={spreadSeries}
              selectedWindow={selectedWindow}
              rollingMode={rollingMode}
              onDataLoaded={setLiveData}
            />

            {/* Chart + Stats */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="xl:col-span-2">
                <SpreadChart
                  series={spreadSeries}
                  selectedWindow={selectedWindow}
                  onWindowChange={setSelectedWindow}
                  liveSpreadPct={liveSpreadPct}
                  rollingMode={rollingMode}
                />
              </div>
              <div>
                <StatisticsPanel
                  series={spreadSeries}
                  selectedWindow={selectedWindow}
                  liveSpreadPct={liveSpreadPct}
                  rollingMode={rollingMode}
                />
              </div>
            </div>

            {/* Signal Cards */}
            <SignalPanel
              series={spreadSeries}
              selectedWindow={selectedWindow}
              liveSpreadPct={liveSpreadPct}
              rollingMode={rollingMode}
            />

            {/* Forward Returns */}
            <ForwardReturnsTable
              series={spreadSeries}
              selectedWindow={selectedWindow}
              liveSpreadPct={liveSpreadPct}
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
            <DailySpreadTable spreadSeries={spreadSeries} stakes={stakes} rollingMode={rollingMode} />
          </div>
        )}

        {activeTab === 'shares' && (
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
            <SharesTab />
          </div>
        )}

        <footer className="text-center text-xs text-slate-700 pb-6">
          Live prices from Dhan API · Historical data in Supabase · Refreshes every 60s
        </footer>
      </main>
    </div>
  )
}
