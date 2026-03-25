'use client'

import { useState } from 'react'
import type { SpreadPoint, StakeHistoryRow, WindowKey, LiveSpreadData } from '@/types'
import LiveSpreadBanner from './LiveSpreadBanner'
import SpreadChart from './SpreadChart'
import StatisticsPanel from './StatisticsPanel'
import SignalPanel from './SignalPanel'
import ForwardReturnsTable from './ForwardReturnsTable'
import StakeHistoryTable from './StakeHistoryTable'

interface Props {
  spreadSeries: SpreadPoint[]
  stakes: StakeHistoryRow[]
  initialLiveData: LiveSpreadData | null
}

export default function SpreadDashboard({ spreadSeries, stakes, initialLiveData }: Props) {
  const [selectedWindow, setSelectedWindow] = useState<WindowKey>('1Y')
  const [liveData, setLiveData] = useState<LiveSpreadData | null>(initialLiveData)

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
          <div className="text-xs text-slate-600">
            {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </div>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-6 py-6 space-y-6">
        {/* Live Banner */}
        <LiveSpreadBanner
          initialData={liveData}
          spreadSeries={spreadSeries}
          selectedWindow={selectedWindow}
        />

        {/* Chart + Stats */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2">
            <SpreadChart
              series={spreadSeries}
              selectedWindow={selectedWindow}
              onWindowChange={setSelectedWindow}
              liveSpreadPct={liveSpreadPct}
            />
          </div>
          <div>
            <StatisticsPanel
              series={spreadSeries}
              selectedWindow={selectedWindow}
              liveSpreadPct={liveSpreadPct}
            />
          </div>
        </div>

        {/* Signal Cards */}
        <SignalPanel
          series={spreadSeries}
          selectedWindow={selectedWindow}
          liveSpreadPct={liveSpreadPct}
        />

        {/* Forward Returns */}
        <ForwardReturnsTable
          series={spreadSeries}
          selectedWindow={selectedWindow}
          liveSpreadPct={liveSpreadPct}
        />

        {/* Stake History */}
        <StakeHistoryTable stakes={stakes} />

        <footer className="text-center text-xs text-slate-700 pb-6">
          Live prices from Yahoo Finance (~15 min delay) · Historical data in Supabase · Refreshes every 60s
        </footer>
      </main>
    </div>
  )
}
