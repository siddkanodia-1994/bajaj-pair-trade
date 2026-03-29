'use client'

import { useState, useEffect, useMemo } from 'react'
import type { SpreadPoint, WindowKey, TradingRules, TradeTranche } from '@/types'
import { WINDOW_MONTHS } from '@/types'
import { subtractMonths, computeFixedWindowStats } from '@/lib/spread-calculator'
import { evaluateTradeSignal } from '@/lib/trade-signals'
import { getSessionToken } from '@/lib/session'
import TradeSignalCard from './TradeSignalCard'
import OpenTradeCard from './OpenTradeCard'
import TradeHistoryTable from './TradeHistoryTable'

interface Props {
  series: SpreadPoint[]
  selectedWindow: WindowKey
  liveSpreadPct: number | undefined
  rules: TradingRules
  isOwner: boolean
  onOwnerUnlock: () => void
}

const TRANCHE_SIZES = ['50%', '30%', '20%']

export default function ActiveTradeTab({ series, selectedWindow, liveSpreadPct, rules, isOwner, onOwnerUnlock }: Props) {
  // ── My Analysis state (visitor's personal trades) ─────────────────────────
  const [myTranches, setMyTranches] = useState<TradeTranche[]>([])
  const [loadingMy, setLoadingMy] = useState(true)

  // ── Owner Portfolio state ─────────────────────────────────────────────────
  const [ownerTranches, setOwnerTranches] = useState<TradeTranche[]>([])
  const [ownerUnlocked, setOwnerUnlocked] = useState(false)
  const [ownerPassword, setOwnerPassword] = useState('')
  const [ownerError, setOwnerError] = useState<string | null>(null)
  const [ownerLoading, setOwnerLoading] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sessionToken = typeof window !== 'undefined' ? getSessionToken() : ''

  // Load trades on mount — visitor gets their own, owner gets ownerTrades too
  useEffect(() => {
    fetch('/api/trades', {
      headers: { 'X-Session-Token': getSessionToken() },
    })
      .then((r) => r.json())
      .then((d) => {
        setMyTranches(d.trades ?? [])
        if (d.ownerTrades) {
          setOwnerTranches(d.ownerTrades)
          setOwnerUnlocked(true)
        }
      })
      .catch(() => setError('Failed to load trades'))
      .finally(() => setLoadingMy(false))
  }, [])

  // If isOwner prop becomes true (owner just logged in via another tab path), reload
  useEffect(() => {
    if (isOwner && !ownerUnlocked) {
      fetch('/api/trades', {
        headers: { 'X-Session-Token': getSessionToken() },
      })
        .then((r) => r.json())
        .then((d) => {
          setMyTranches(d.trades ?? [])
          if (d.ownerTrades) {
            setOwnerTranches(d.ownerTrades)
            setOwnerUnlocked(true)
          }
        })
        .catch(() => {})
    }
  }, [isOwner]) // eslint-disable-line react-hooks/exhaustive-deps

  // Compute current Z-score (fixed window)
  const currentZscore = useMemo(() => {
    const last = series[series.length - 1]
    if (!last) return null
    const spread = liveSpreadPct ?? last.spread_pct
    const visibleValues = selectedWindow === 'ALL'
      ? series.map((p) => p.spread_pct)
      : series.filter((p) => p.date >= subtractMonths(last.date, WINDOW_MONTHS[selectedWindow]!)).map((p) => p.spread_pct)
    return computeFixedWindowStats(visibleValues, spread).zscore
  }, [series, selectedWindow, liveSpreadPct])

  const myOpen = useMemo(() => myTranches.filter((t) => t.status === 'open'), [myTranches])
  const myClosed = useMemo(() => myTranches.filter((t) => t.status === 'closed'), [myTranches])

  const mySignal = useMemo(
    () => evaluateTradeSignal(currentZscore, myOpen, rules),
    [currentZscore, myOpen, rules]
  )

  // ── Owner unlock handler ─────────────────────────────────────────────────

  async function handleOwnerUnlock() {
    setOwnerLoading(true)
    setOwnerError(null)
    try {
      const res = await fetch('/api/auth/verify-owner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: ownerPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Wrong password')

      // Cookie is now set by the server — re-fetch using the visitor's original session token.
      // The server will see bajaj_owner cookie and return ownerTrades alongside the visitor's trades.
      const tradesRes = await fetch('/api/trades', {
        headers: { 'X-Session-Token': getSessionToken() },
      })
      const tradesData = await tradesRes.json()
      setOwnerTranches(tradesData.ownerTrades ?? [])
      // myTranches is intentionally NOT overwritten — visitor's personal trades stay intact
      setOwnerUnlocked(true)
      setOwnerPassword('')
      onOwnerUnlock()
    } catch (e) {
      setOwnerError(String(e).replace('Error: ', ''))
    } finally {
      setOwnerLoading(false)
    }
  }

  // ── My Analysis trade handlers ────────────────────────────────────────────

  async function handleEnter(ov?: { spread: number; z: number | null; date: string; sizeLabel?: string }) {
    setSaving(true)
    setError(null)
    const today = ov?.date ?? new Date().toISOString().split('T')[0]
    const spread = ov?.spread ?? liveSpreadPct ?? series[series.length - 1]?.spread_pct ?? 0
    const z = ov !== undefined ? ov.z : currentZscore
    const tradeGroup = crypto.randomUUID()
    try {
      const res = await fetch('/api/trades', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Token': getSessionToken(),
        },
        body: JSON.stringify({
          trade_group: tradeGroup,
          tranche_num: 1,
          direction: (z ?? currentZscore) != null && ((z ?? currentZscore)! <= 0) ? 'long' : 'short',
          window_key: selectedWindow,
          entry_date: today,
          entry_spread: spread,
          entry_z: z,
          size_label: ov?.sizeLabel ?? '50%',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save')
      setMyTranches((prev) => [data.trade, ...prev])
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleAdd(ov?: { spread: number; z: number | null; date: string; sizeLabel?: string }) {
    setSaving(true)
    setError(null)
    if (myOpen.length === 0 || myOpen.length >= 3) { setSaving(false); return }
    const today = ov?.date ?? new Date().toISOString().split('T')[0]
    const spread = ov?.spread ?? liveSpreadPct ?? series[series.length - 1]?.spread_pct ?? 0
    const z = ov !== undefined ? ov.z : currentZscore
    const oldest = [...myOpen].sort((a, b) => a.entry_date.localeCompare(b.entry_date))[0]
    const nextTranche = myOpen.length + 1
    const sizeLabel = ov?.sizeLabel ?? TRANCHE_SIZES[nextTranche - 1] ?? '20%'
    try {
      const res = await fetch('/api/trades', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Token': getSessionToken(),
        },
        body: JSON.stringify({
          trade_group: oldest.trade_group,
          tranche_num: nextTranche,
          direction: oldest.direction,
          window_key: selectedWindow,
          entry_date: today,
          entry_spread: spread,
          entry_z: z,
          size_label: sizeLabel,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save')
      setMyTranches((prev) => [data.trade, ...prev])
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleCloseTranche(id: number, reason: 'target' | 'time_stop' | 'hard_stop' | 'manual') {
    setSaving(true)
    setError(null)
    const today = new Date().toISOString().split('T')[0]
    const spread = liveSpreadPct ?? series[series.length - 1]?.spread_pct ?? 0
    try {
      const res = await fetch(`/api/trades/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Token': getSessionToken(),
        },
        body: JSON.stringify({
          exit_date: today,
          exit_spread: spread,
          exit_z: currentZscore,
          exit_reason: reason,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to update')
      setMyTranches((prev) => prev.map((t) => (t.id === id ? data.trade : t)))
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleExitAll(reason: 'target' | 'time_stop' | 'hard_stop' | 'manual') {
    for (const t of myOpen) {
      await handleCloseTranche(t.id, reason)
    }
  }

  async function handleDeleteTranche(id: number) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/trades/${id}`, {
        method: 'DELETE',
        headers: { 'X-Session-Token': getSessionToken() },
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to delete')
      }
      setMyTranches((prev) => prev.filter((t) => t.id !== id))
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loadingMy) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-slate-700 bg-slate-800/50 p-5 animate-pulse">
            <div className="h-6 bg-slate-700 rounded w-48 mb-3" />
            <div className="h-4 bg-slate-700 rounded w-96" />
          </div>
        ))}
      </div>
    )
  }

  const ownerOpen = ownerTranches.filter((t) => t.status === 'open')
  const ownerClosed = ownerTranches.filter((t) => t.status === 'closed')
  const ownerSignal = evaluateTradeSignal(currentZscore, ownerOpen, rules)

  // If user IS the owner (session token matches owner token), show unified view — no split needed
  const sessionIsOwner = typeof window !== 'undefined' &&
    localStorage.getItem('bajaj_session') === (process.env.NEXT_PUBLIC_OWNER_SESSION_TOKEN ?? 'owner')

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-lg border border-red-700 bg-red-900/20 px-4 py-3 text-sm text-red-400">
          {error}{' '}
          <button onClick={() => setError(null)} className="ml-2 underline hover:no-underline">Dismiss</button>
        </div>
      )}

      {/* ── Owner Portfolio Panel ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-600/60 bg-slate-800/30 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-200">Owner Portfolio</div>
            <div className="text-xs text-slate-500 mt-0.5">
              {ownerUnlocked ? 'Live view — read only' : 'Password protected · Enter password to view'}
            </div>
          </div>
          {ownerUnlocked && (
            <span className="text-xs text-green-400 border border-green-700/50 px-2 py-0.5 rounded-full">Unlocked</span>
          )}
        </div>

        {!ownerUnlocked ? (
          <div className="px-5 py-6">
            <div className="flex items-center gap-3 max-w-sm">
              <input
                type="password"
                placeholder="Enter owner password"
                value={ownerPassword}
                onChange={(e) => setOwnerPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleOwnerUnlock() }}
                className="flex-1 text-sm bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 placeholder-slate-500"
              />
              <button
                onClick={handleOwnerUnlock}
                disabled={ownerLoading || !ownerPassword}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
              >
                {ownerLoading ? '…' : 'Unlock'}
              </button>
            </div>
            {ownerError && (
              <div className="mt-2 text-xs text-red-400">{ownerError}</div>
            )}
          </div>
        ) : (
          <div className="px-5 py-5 space-y-5">
            {/* Owner signal (read-only) */}
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Signal</div>
              <TradeSignalCard
                signal={ownerSignal}
                currentZ={currentZscore}
                liveSpreadPct={liveSpreadPct ?? null}
                selectedWindow={selectedWindow}
                openTranches={ownerOpen}
                onEnter={() => {}}
                onAdd={() => {}}
                onExitAll={() => {}}
                saving={true}
                readOnly
              />
            </div>

            {ownerOpen.length > 0 && (
              <OpenTradeCard
                openTranches={ownerOpen}
                liveSpreadPct={liveSpreadPct ?? null}
                currentZ={currentZscore}
                rules={rules}
                saving={true}
                onCloseTranche={() => {}}
                onDeleteTranche={() => {}}
                readOnly
              />
            )}

            {ownerOpen.length === 0 && ownerClosed.length === 0 && (
              <div className="text-sm text-slate-500 py-4 text-center">No owner trades on record.</div>
            )}

            {ownerClosed.length > 0 && (
              <TradeHistoryTable closedTranches={ownerClosed} onDelete={() => {}} readOnly />
            )}
          </div>
        )}
      </div>

      {/* ── My Analysis Panel ────────────────────────────────────────────── */}
      <div className="space-y-6">
        <div>
          <h2 className="text-base font-semibold text-white">My Analysis</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Personal trade journal · Visible only to this browser session · {rules.time_stop_60d}-day time stop · Hard stop Z ≤ −{rules.hard_stop_z}
          </p>
        </div>

        <TradeSignalCard
          signal={mySignal}
          currentZ={currentZscore}
          liveSpreadPct={liveSpreadPct ?? null}
          selectedWindow={selectedWindow}
          openTranches={myOpen}
          onEnter={handleEnter}
          onAdd={handleAdd}
          onExitAll={handleExitAll}
          saving={saving}
        />

        {myOpen.length > 0 && (
          <OpenTradeCard
            openTranches={myOpen}
            liveSpreadPct={liveSpreadPct ?? null}
            currentZ={currentZscore}
            rules={rules}
            saving={saving}
            onCloseTranche={handleCloseTranche}
            onDeleteTranche={handleDeleteTranche}
          />
        )}

        {myOpen.length === 0 && mySignal.action === 'NEUTRAL' && (
          <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-6 text-center">
            <div className="text-slate-500 text-sm">
              No active trade. Signal will update automatically when Z-score approaches entry threshold.
            </div>
            <div className="mt-2 text-xs text-slate-600">
              Entry triggers at Z ≤ {rules.strong_long_threshold} (Strong Long) on the {selectedWindow} window.
            </div>
          </div>
        )}

        <TradeHistoryTable closedTranches={myClosed} onDelete={handleDeleteTranche} />
      </div>
    </div>
  )
}
