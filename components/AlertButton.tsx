'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { getSessionToken } from '@/lib/session'

interface SpreadAlert {
  id: string
  pair: 'bajaj' | 'grasim' | 'both'
  threshold_pct: number
  telegram_chat_id: string
  last_fired_date: string | null
  created_at: string
  operator: string
  metric: string
  window_key: string
}

interface Props {
  lightMode?: boolean
}

const PAIR_LABELS: Record<string, string> = {
  bajaj: 'Bajaj',
  grasim: 'Grasim',
  both: 'Both',
}

const CHAT_ID_KEY = 'bajaj_alert_chat_id'
const WINDOW_KEYS = ['1Y', '2Y', '3Y', '4Y', '5Y'] as const

export default function AlertButton({ lightMode }: Props) {
  const [open, setOpen] = useState(false)
  const [alerts, setAlerts] = useState<SpreadAlert[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    pair: 'bajaj',
    operator: '>=',
    metric: 'spread_pct',
    windowKey: '1Y',
    threshold: '',
    chatId: '',
  })
  const panelRef = useRef<HTMLDivElement>(null)

  const fetchAlerts = useCallback(async () => {
    const token = getSessionToken()
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch('/api/alerts', { headers: { 'X-Session-Token': token } })
      const data = await res.json()
      setAlerts(data.alerts ?? [])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  // Pre-fill chatId from localStorage when opening
  useEffect(() => {
    if (open) {
      fetchAlerts()
      const saved = typeof window !== 'undefined' ? localStorage.getItem(CHAT_ID_KEY) : null
      if (saved) setForm((f) => f.chatId ? f : { ...f, chatId: saved })
    }
  }, [open, fetchAlerts])

  // Close on outside click
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [open])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const threshold = parseFloat(form.threshold)
    if (isNaN(threshold)) { setError('Enter a valid threshold'); return }
    if (!/^-?\d+$/.test(form.chatId.trim())) { setError('Enter a valid Telegram chat ID (numbers only)'); return }
    const token = getSessionToken()
    setSaving(true)
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Token': token },
        body: JSON.stringify({
          pair: form.pair,
          threshold_pct: threshold,
          telegram_chat_id: form.chatId.trim(),
          operator: form.operator,
          metric: form.metric,
          window_key: form.windowKey,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Failed to save alert')
        return
      }
      const d = await res.json()
      setAlerts((prev) => [d.alert, ...prev])
      // Persist chatId to localStorage; only clear threshold
      localStorage.setItem(CHAT_ID_KEY, form.chatId.trim())
      setForm((f) => ({ ...f, threshold: '' }))
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    const token = getSessionToken()
    try {
      await fetch(`/api/alerts/${id}`, {
        method: 'DELETE',
        headers: { 'X-Session-Token': token },
      })
      setAlerts((prev) => prev.filter((a) => a.id !== id))
    } catch {
      // silent
    }
  }

  const count = alerts.length

  const pillStyle = { backgroundColor: '#1e293b', border: '1px solid #475569', color: '#94a3b8' }

  function pillBtn(active: boolean) {
    return {
      backgroundColor: active ? '#3b82f6' : 'transparent',
      color: active ? '#fff' : '#94a3b8',
      border: `1px solid ${active ? '#3b82f6' : '#334155'}`,
    }
  }

  function alertLabel(a: SpreadAlert) {
    const op = a.operator === '<=' ? '≤' : '≥'
    const isZscore = a.metric === 'zscore'
    const value = isZscore
      ? `${op} ${a.threshold_pct.toFixed(2)}`
      : `${op} ${a.threshold_pct.toFixed(2)}%`
    const metricTag = isZscore ? ` Z-score (${a.window_key ?? '1Y'})` : ' Spread'
    return `${PAIR_LABELS[a.pair]}${metricTag} ${value}`
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Trigger pill */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer select-none transition-colors"
        style={pillStyle}
        title="Spread alerts"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 00-9.33-4.993A6 6 0 006 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        <span>Alerts</span>
        {count > 0 && (
          <span
            className="flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold"
            style={{ backgroundColor: '#3b82f6', color: '#fff' }}
          >
            {count}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute top-full right-0 mt-1 z-50 w-80 rounded-xl shadow-2xl overflow-hidden"
          style={{ backgroundColor: '#0f172a', border: '1px solid #334155' }}
        >
          {/* Set new alert */}
          <div className="p-4 border-b border-slate-700">
            <p className="text-[10px] font-semibold tracking-widest uppercase text-slate-500 mb-3">
              Set New Alert
            </p>
            <form onSubmit={handleCreate} className="space-y-3">
              {/* Pair selector */}
              <div className="flex gap-1.5">
                {(['bajaj', 'grasim', 'both'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, pair: p }))}
                    className="flex-1 py-1 rounded text-xs font-medium transition-colors"
                    style={pillBtn(form.pair === p)}
                  >
                    {PAIR_LABELS[p]}
                  </button>
                ))}
              </div>

              {/* Metric selector */}
              <div className="flex gap-1.5">
                {(['spread_pct', 'zscore'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, metric: m }))}
                    className="flex-1 py-1 rounded text-xs font-medium transition-colors"
                    style={pillBtn(form.metric === m)}
                  >
                    {m === 'spread_pct' ? 'Spread %' : 'Z-score'}
                  </button>
                ))}
              </div>

              {/* Window selector — only for Z-score */}
              {form.metric === 'zscore' && (
                <div className="flex gap-1">
                  {WINDOW_KEYS.map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, windowKey: w }))}
                      className="flex-1 py-0.5 rounded text-[11px] font-medium transition-colors"
                      style={pillBtn(form.windowKey === w)}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              )}

              {/* Operator + threshold */}
              <div className="flex items-center gap-2">
                <div className="flex gap-1 shrink-0">
                  {(['>=', '<='] as const).map((op) => (
                    <button
                      key={op}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, operator: op }))}
                      className="w-7 py-1 rounded text-xs font-mono font-medium transition-colors"
                      style={pillBtn(form.operator === op)}
                    >
                      {op === '>=' ? '≥' : '≤'}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  step="0.01"
                  placeholder={form.metric === 'zscore' ? '-2.00' : '-2.50'}
                  value={form.threshold}
                  onChange={(e) => setForm((f) => ({ ...f, threshold: e.target.value }))}
                  className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
                <span className="text-slate-400 text-xs shrink-0">
                  {form.metric === 'zscore' ? 'σ' : '%'}
                </span>
              </div>

              {/* Telegram chat ID */}
              <div className="space-y-1">
                <input
                  type="text"
                  placeholder="Your Telegram chat ID"
                  value={form.chatId}
                  onChange={(e) => setForm((f) => ({ ...f, chatId: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Message{' '}
                  <span className="text-blue-400">@userinfobot</span>
                  {' '}on Telegram to get your chat ID
                </p>
              </div>

              {error && <p className="text-red-400 text-[11px]">{error}</p>}

              <button
                type="submit"
                disabled={saving}
                className="w-full py-1.5 rounded text-xs font-medium transition-colors"
                style={{ backgroundColor: '#3b82f6', color: '#fff', opacity: saving ? 0.6 : 1 }}
              >
                {saving ? 'Saving…' : 'Set Alert'}
              </button>
            </form>
          </div>

          {/* Active alerts list */}
          <div className="p-4">
            <p className="text-[10px] font-semibold tracking-widest uppercase text-slate-500 mb-2">
              Active Alerts {loading && <span className="normal-case font-normal text-slate-600">loading…</span>}
            </p>
            {alerts.length === 0 && !loading && (
              <p className="text-slate-600 text-xs">No alerts set yet.</p>
            )}
            <div className="space-y-2">
              {alerts.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-2 rounded-lg px-3 py-2"
                  style={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                >
                  <div className="min-w-0">
                    <span className="text-slate-200 text-xs font-medium">
                      {alertLabel(a)}
                    </span>
                    <p className="text-slate-500 text-[11px] truncate">ID: {a.telegram_chat_id}</p>
                    {a.last_fired_date && (
                      <p className="text-blue-400 text-[10px]">Last fired: {a.last_fired_date}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(a.id)}
                    className="shrink-0 text-slate-500 hover:text-red-400 transition-colors"
                    title="Delete alert"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
