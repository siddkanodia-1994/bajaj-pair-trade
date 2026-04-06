'use client'

import { useState, useEffect } from 'react'

const COMPANIES = ['GRASIM', 'ULTRACEMCO', 'ABCAPITAL', 'IDEA', 'HINDALCO', 'ABFRL', 'ABLBL'] as const
type GrasimCompany = typeof COMPANIES[number]

const LABELS: Record<GrasimCompany, string> = {
  GRASIM:     'Grasim Industries',
  ULTRACEMCO: 'UltraTech Cement',
  ABCAPITAL:  'Aditya Birla Capital',
  IDEA:       'Vodafone Idea',
  HINDALCO:   'Hindalco Industries',
  ABFRL:      'AB Fashion & Retail',
  ABLBL:      'AB Lifestyle Brands',
}

interface GrasimShareHistoryRow {
  id: number
  company: string
  effective_date: string
  shares: number
  source: string | null
}

function formatShares(n: number) {
  return (n / 1e7).toFixed(2) + ' Cr'
}

function CompanySection({
  company,
  rows,
  onSaved,
}: {
  company: GrasimCompany
  rows: GrasimShareHistoryRow[]
  onSaved: () => void
}) {
  const [newDate,   setNewDate]   = useState('')
  const [newShares, setNewShares] = useState('')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [deleting,  setDeleting]  = useState<number | null>(null)
  const [expanded,  setExpanded]  = useState(false)

  async function handleSave() {
    const sharesNum = Number(newShares.replace(/,/g, ''))
    if (!newDate || !sharesNum) { setError('Date and share count are required'); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/grasim/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company, effective_date: newDate, shares: sharesNum }),
      })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? 'Save failed') }
      setNewDate(''); setNewShares('')
      onSaved()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally { setSaving(false) }
  }

  async function handleDelete(id: number) {
    setDeleting(id)
    try {
      await fetch('/api/grasim/shares', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      onSaved()
    } finally { setDeleting(null) }
  }

  const companyRows = rows.filter(r => r.company === company)
  const PREVIEW = 10
  const visibleRows = expanded ? companyRows : companyRows.slice(0, PREVIEW)
  const hasMore = companyRows.length > PREVIEW

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700 bg-slate-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">{LABELS[company]}</h3>
        {companyRows[0] && (
          <span className="text-xs text-slate-400">
            Latest: <span className="text-white font-medium">{formatShares(companyRows[0].shares)}</span>
            {' '}as of{' '}
            <span className="text-white">{companyRows[0].effective_date}</span>
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-700 text-slate-500">
              <th className="px-4 py-2 text-left font-medium">Effective Date</th>
              <th className="px-4 py-2 text-right font-medium">Shares (Cr)</th>
              <th className="px-4 py-2 text-left font-medium">Source</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {companyRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-4 text-center text-slate-600">No entries yet</td>
              </tr>
            ) : (
              visibleRows.map((row) => (
                <tr key={row.id} className="border-b border-slate-800 hover:bg-slate-800/80">
                  <td className="px-4 py-2 text-slate-300">{row.effective_date}</td>
                  <td className="px-4 py-2 text-right font-mono text-white">{formatShares(row.shares)}</td>
                  <td className="px-4 py-2 text-slate-500">{row.source ?? '—'}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => handleDelete(row.id)}
                      disabled={deleting === row.id}
                      className="text-slate-600 hover:text-red-400 transition-colors disabled:opacity-50 text-xs px-2"
                      title="Delete row"
                    >
                      {deleting === row.id ? '…' : '×'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="px-4 py-2 border-t border-slate-700/50 bg-slate-900/20">
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            {expanded
              ? '▲ Show less'
              : `▼ Show all ${companyRows.length} rows (${companyRows.length - PREVIEW} more)`}
          </button>
        </div>
      )}

      <div className="px-4 py-3 border-t border-slate-700 bg-slate-900/30">
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
          />
          <input
            type="text"
            placeholder="Shares (e.g. 622481903)"
            value={newShares}
            onChange={(e) => setNewShares(e.target.value)}
            className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500 w-48"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1 rounded text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Add Entry'}
          </button>
          {error && <span className="text-red-400 text-xs">{error}</span>}
        </div>
      </div>
    </div>
  )
}

export default function GrasimSharesTab() {
  const [rows,    setRows]    = useState<GrasimShareHistoryRow[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/grasim/shares')
      const data = await res.json()
      setRows(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-white">Shares Outstanding</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Historical share counts used to compute live market cap (mcap = price × shares in Cr).
        </p>
      </div>

      {loading ? (
        <div className="text-slate-500 text-sm py-8 text-center">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {COMPANIES.map((c) => (
            <CompanySection key={c} company={c} rows={rows} onSaved={load} />
          ))}
        </div>
      )}
    </div>
  )
}
