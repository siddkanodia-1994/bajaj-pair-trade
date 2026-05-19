'use client'

import { useState, useEffect } from 'react'

interface Props {
  renewedAt: string | null
  isOwner?: boolean
}

function getStatus(renewedAt: string | null): 'ok' | 'warning' | 'expired' {
  if (!renewedAt) return 'expired'
  const ageHours = (Date.now() - new Date(renewedAt).getTime()) / 3_600_000
  if (ageHours < 20) return 'ok'
  if (ageHours < 24) return 'warning'
  return 'expired'
}

function ageLabel(renewedAt: string | null): string {
  if (!renewedAt) return 'never'
  const ageMs = Date.now() - new Date(renewedAt).getTime()
  const hours = Math.floor(ageMs / 3_600_000)
  const mins  = Math.floor((ageMs % 3_600_000) / 60_000)
  if (hours === 0) return `${mins}m ago`
  if (mins  === 0) return `${hours}h ago`
  return `${hours}h ${mins}m ago`
}

export default function DhanTokenWidget({ renewedAt: initialRenewedAt, isOwner = false }: Props) {
  const [renewedAt, setRenewedAt] = useState(initialRenewedAt)
  const [open, setOpen]           = useState(false)
  const [token, setToken]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [tick, setTick]           = useState(0)

  // Re-render age label every minute
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  // Auto-expand when expiring or expired
  useEffect(() => {
    const status = getStatus(renewedAt)
    if (status !== 'ok') setOpen(true)
  }, [renewedAt])

  void tick // consumed to re-render age label

  const status = getStatus(renewedAt)

  // When fresh: owner sees a static age label, visitors see nothing
  if (status === 'ok') {
    if (!isOwner) return null
    return <div className="text-xs text-slate-500">Token: {ageLabel(renewedAt)}</div>
  }

  const pillStyle =
    status === 'expired' ? 'bg-red-500/15 border-red-500/50 text-red-400' :
    'bg-amber-500/15 border-amber-500/50 text-amber-400'

  const pillBorder = `border rounded-full px-2 py-0.5 ${pillStyle}`

  async function handleSave() {
    setError(null)
    const t = token.trim()
    if (!t) { setError('Paste your Dhan token first'); return }
    if (!t.startsWith('eyJ')) { setError('Not a valid token — should start with eyJ'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/dhan/token', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: t }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Save failed'); return }
      setRenewedAt(data.renewed_at)
      setToken('')
      setOpen(false)
    } catch {
      setError('Network error — try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`text-xs transition-colors ${pillBorder}`}
        title="Dhan token status — click to update"
      >
        {status === 'expired'
          ? 'Token: EXPIRED ⚠'
          : status === 'warning'
            ? `Token: ${ageLabel(renewedAt)} ⚠`
            : `Token: ${ageLabel(renewedAt)}`}
      </button>

      {open && (
        <div className="flex items-center gap-2">
          <input
            type="password"
            value={token}
            onChange={(e) => { setToken(e.target.value); setError(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
            placeholder="Paste new Dhan token…"
            autoFocus
            className="text-xs font-mono bg-slate-800 border border-slate-600 text-white rounded px-2 py-1 w-48 focus:outline-none focus:border-blue-500 placeholder-slate-600"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs px-3 py-1 rounded border border-blue-600 bg-blue-600/10 text-blue-400 hover:bg-blue-600/20 transition-colors disabled:opacity-50"
          >
            {saving ? '…' : 'Save'}
          </button>
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
      )}
    </div>
  )
}
