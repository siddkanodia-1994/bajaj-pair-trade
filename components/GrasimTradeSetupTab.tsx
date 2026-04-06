'use client'

import { useState, useEffect } from 'react'
import type { GrasimLiveData, GrasimSubsidiary } from '@/types/grasim'

interface Props {
  liveData: GrasimLiveData | null
  currentZ: number | null
  selectedCompanies: GrasimSubsidiary[]
}

// F&O lot sizes — NSE defaults (as of Apr 2026)
const LOT_SIZES: Record<string, number> = {
  GRASIM:     250,
  ULTRACEMCO: 50,
  ABCAPITAL:  3100,
  IDEA:       70000,
  HINDALCO:   1075,
  ABFRL:      2000,
  ABLBL:      0,   // not in F&O
}

// Default NRML margin rates (Zerodha, Apr 2026)
const DEFAULT_MARGIN_RATES: Record<string, number> = {
  GRASIM:     17.75,
  ULTRACEMCO: 18.57,
  ABCAPITAL:  36.15,
  IDEA:       20,
  HINDALCO:   20,
  ABFRL:      20,
  ABLBL:      20,
}

const LABELS: Record<string, string> = {
  GRASIM:     'Grasim Industries',
  ULTRACEMCO: 'UltraTech Cement',
  ABCAPITAL:  'Aditya Birla Capital',
  IDEA:       'Vodafone Idea',
  HINDALCO:   'Hindalco Industries',
  ABFRL:      'AB Fashion & Retail',
  ABLBL:      'AB Lifestyle Brands',
}

const CR = 1_00_00_000

function getPrice(liveData: GrasimLiveData, company: string): number | null {
  const key = company.toLowerCase() as keyof GrasimLiveData
  const quote = liveData[key] as { price?: number } | undefined
  return quote?.price ?? null
}

function fmt2(n: number) { return n.toFixed(2) }

function ImbBadge({ pct }: { pct: number }) {
  const color = pct < 5 ? 'text-green-400 bg-green-400/10 border-green-600'
    : pct < 15 ? 'text-amber-400 bg-amber-400/10 border-amber-600'
    : 'text-red-400 bg-red-400/10 border-red-600'
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-medium ${color}`}>
      {pct.toFixed(1)}% imbalance
    </span>
  )
}

export default function GrasimTradeSetupTab({ liveData, currentZ, selectedCompanies }: Props) {
  // Direction: Long GRASIM / Short basket when Z <= 0
  const signalDir = (currentZ == null || currentZ <= 0) ? 'long-grasim' : 'short-grasim'
  const [direction, setDirection] = useState<'long-grasim' | 'short-grasim'>(signalDir)
  const [userToggledDir, setUserToggledDir] = useState(false)

  // GRASIM leg
  const [grasimLots,    setGrasimLots]    = useState(1)
  const [grasimLotSize, setGrasimLotSize] = useState(LOT_SIZES['GRASIM'])
  const [grasimMargin,  setGrasimMargin]  = useState(DEFAULT_MARGIN_RATES['GRASIM'])

  // Per-subsidiary state: lotSize, lots (auto), marginRate
  const [subLotSizes,  setSubLotSizes]  = useState<Record<string, number>>({})
  const [subLots,      setSubLots]      = useState<Record<string, number>>({})
  const [subMargins,   setSubMargins]   = useState<Record<string, number>>({})
  const [manualSubLots, setManualSubLots] = useState<Record<string, boolean>>({})

  // Init subsidiary state when selection changes
  useEffect(() => {
    setSubLotSizes(prev => {
      const next = { ...prev }
      for (const c of selectedCompanies) {
        if (!(c in next)) next[c] = LOT_SIZES[c] ?? 1
      }
      return next
    })
    setSubMargins(prev => {
      const next = { ...prev }
      for (const c of selectedCompanies) {
        if (!(c in next)) next[c] = DEFAULT_MARGIN_RATES[c] ?? 20
      }
      return next
    })
  }, [selectedCompanies])

  // Re-derive direction when Z changes
  useEffect(() => {
    if (userToggledDir) return
    setDirection((currentZ == null || currentZ <= 0) ? 'long-grasim' : 'short-grasim')
  }, [currentZ, userToggledDir])

  // F&O eligible subsidiaries (exclude ABLBL)
  const fnoSubs = selectedCompanies.filter(c => c !== 'ABLBL')
  const ablblSelected = selectedCompanies.includes('ABLBL')

  const grasimPrice = liveData ? getPrice(liveData, 'GRASIM') : null
  const grasimNotional = grasimPrice != null ? (grasimPrice * grasimLots * grasimLotSize) / CR : null

  // Auto-compute per-sub lots: match grasimNotional / fnoSubs.length per subsidiary
  useEffect(() => {
    if (!grasimPrice || !grasimNotional || fnoSubs.length === 0) return
    const targetPerSub = grasimNotional / fnoSubs.length
    setSubLots(prev => {
      const next = { ...prev }
      for (const c of fnoSubs) {
        if (manualSubLots[c]) continue
        const price = liveData ? getPrice(liveData, c) : null
        const ls = subLotSizes[c] ?? LOT_SIZES[c] ?? 1
        if (!price || !ls) { next[c] = 1; continue }
        next[c] = Math.max(1, Math.round((targetPerSub * CR) / (price * ls)))
      }
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grasimPrice, grasimNotional, fnoSubs.length, subLotSizes, liveData])

  function handleFlip() {
    setDirection(d => d === 'long-grasim' ? 'short-grasim' : 'long-grasim')
    setUserToggledDir(true)
  }

  function handleReset() {
    setGrasimLots(1)
    setGrasimLotSize(LOT_SIZES['GRASIM'])
    setGrasimMargin(DEFAULT_MARGIN_RATES['GRASIM'])
    setSubLotSizes({})
    setSubMargins({})
    setManualSubLots({})
    setUserToggledDir(false)
    setDirection((currentZ == null || currentZ <= 0) ? 'long-grasim' : 'short-grasim')
  }

  // Totals
  const subNotionals = fnoSubs.map(c => {
    const price = liveData ? getPrice(liveData, c) : null
    const ls = subLotSizes[c] ?? LOT_SIZES[c] ?? 1
    const lots = subLots[c] ?? 1
    return price != null ? (price * lots * ls) / CR : null
  })
  const totalSubNotional = subNotionals.every(v => v != null)
    ? subNotionals.reduce((s, v) => s! + v!, 0)!
    : null

  const grasimMarginAmt = grasimNotional != null ? grasimNotional * grasimMargin / 100 : null
  const subMarginAmts = fnoSubs.map((c, i) => {
    const n = subNotionals[i]
    const mr = subMargins[c] ?? DEFAULT_MARGIN_RATES[c] ?? 20
    return n != null ? n * mr / 100 : null
  })
  const totalMargin = grasimMarginAmt != null && subMarginAmts.every(v => v != null)
    ? grasimMarginAmt + subMarginAmts.reduce((s, v) => s! + v!, 0)!
    : null

  const imbPct = grasimNotional != null && totalSubNotional != null
    ? Math.abs(grasimNotional - totalSubNotional) / Math.max(grasimNotional, totalSubNotional) * 100
    : null

  const grasimSide  = direction === 'long-grasim' ? 'L' : 'S'
  const basketSide  = direction === 'long-grasim' ? 'S' : 'L'
  const grasimColor = grasimSide === 'L' ? 'text-green-400 bg-green-600/20 border-green-700' : 'text-red-400 bg-red-600/20 border-red-700'
  const basketColor = basketSide === 'L' ? 'text-green-400 bg-green-600/20 border-green-700' : 'text-red-400 bg-red-600/20 border-red-700'

  const thCls = 'text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 text-right first:text-left'
  const tdCls = 'px-4 py-3 text-sm text-right'

  function numInput(
    value: number,
    onChange: (v: number) => void,
    step = 1,
    min = 1,
  ) {
    return (
      <input
        type="number"
        step={step}
        min={min}
        value={value}
        onChange={e => {
          const v = parseFloat(e.target.value)
          if (!isNaN(v) && v >= min) onChange(v)
        }}
        className="w-full bg-slate-800 border border-slate-600 text-white text-sm rounded px-2 py-1 focus:outline-none focus:border-blue-500 text-right"
      />
    )
  }

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-white">Trade Setup</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Futures pair trade sizing · GRASIM vs selected basket subsidiaries
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Direction:</span>
            <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${grasimColor}`}>
              {grasimSide === 'L' ? 'LONG' : 'SHORT'} GRASIM
            </span>
            <span className="text-slate-600">/</span>
            <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${basketColor}`}>
              {basketSide === 'L' ? 'LONG' : 'SHORT'} BASKET
            </span>
            <button
              onClick={handleFlip}
              className="text-xs px-2.5 py-1 rounded border border-slate-600 bg-slate-800 text-slate-300 hover:text-white hover:border-slate-400 transition-colors"
            >
              ⇄ Flip
            </button>
            {userToggledDir && (
              <span className="text-xs text-amber-400 italic">manual</span>
            )}
          </div>
          {currentZ != null && (
            <span className="text-xs text-slate-500">
              Z = <span className={`font-medium ${currentZ < 0 ? 'text-green-400' : 'text-red-400'}`}>
                {currentZ > 0 ? '+' : ''}{currentZ.toFixed(2)}
              </span>
            </span>
          )}
          <button
            onClick={handleReset}
            className="text-xs px-3 py-1 rounded border border-slate-600 bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700">
              <th className={thCls} style={{ textAlign: 'left' }}>Instrument</th>
              <th className={thCls}>Price (₹)</th>
              <th className={thCls}>Lot Size</th>
              <th className={thCls}>No. of Lots</th>
              <th className={thCls}>Amount (₹ Cr)</th>
              <th className={thCls}>Margin Rate %</th>
              <th className={thCls}>Margin (₹ Cr)</th>
            </tr>
          </thead>
          <tbody>
            {/* GRASIM row */}
            <tr className="border-b border-slate-800">
              <td className={`${tdCls} text-left`}>
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-bold border ${grasimColor}`}>{grasimSide}</span>
                  <span className="text-white font-medium">GRASIM</span>
                </div>
              </td>
              <td className={tdCls}>
                <span className="text-slate-300 font-medium">
                  {grasimPrice != null ? `₹${grasimPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}
                </span>
              </td>
              <td className={`${tdCls} w-24`}>
                {numInput(grasimLotSize, v => setGrasimLotSize(v))}
              </td>
              <td className={`${tdCls} w-24`}>
                {numInput(grasimLots, v => setGrasimLots(v))}
              </td>
              <td className={tdCls}>
                <span className="text-white font-medium">
                  {grasimNotional != null ? `₹${fmt2(grasimNotional)} Cr` : '—'}
                </span>
              </td>
              <td className={`${tdCls} w-28`}>
                {numInput(grasimMargin, v => setGrasimMargin(v), 0.01, 0)}
              </td>
              <td className={tdCls}>
                <span className="text-white font-medium">
                  {grasimMarginAmt != null ? `₹${fmt2(grasimMarginAmt)} Cr` : '—'}
                </span>
              </td>
            </tr>

            {/* Subsidiary rows */}
            {fnoSubs.map((c, i) => {
              const price = liveData ? getPrice(liveData, c) : null
              const ls = subLotSizes[c] ?? LOT_SIZES[c] ?? 1
              const lots = subLots[c] ?? 1
              const mr = subMargins[c] ?? DEFAULT_MARGIN_RATES[c] ?? 20
              const notional = price != null ? (price * lots * ls) / CR : null
              const marginAmt = notional != null ? notional * mr / 100 : null
              return (
                <tr key={c} className="border-b border-slate-800">
                  <td className={`${tdCls} text-left`}>
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-bold border ${basketColor}`}>{basketSide}</span>
                      <div>
                        <div className="text-white font-medium">{c}</div>
                        <div className="text-xs text-slate-500">{LABELS[c]}</div>
                      </div>
                    </div>
                  </td>
                  <td className={tdCls}>
                    <span className="text-slate-300 font-medium">
                      {price != null ? `₹${price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}
                    </span>
                  </td>
                  <td className={`${tdCls} w-24`}>
                    {numInput(ls, v => setSubLotSizes(prev => ({ ...prev, [c]: v })))}
                  </td>
                  <td className={`${tdCls} w-24`}>
                    {numInput(lots, v => {
                      setSubLots(prev => ({ ...prev, [c]: v }))
                      setManualSubLots(prev => ({ ...prev, [c]: true }))
                    })}
                  </td>
                  <td className={tdCls}>
                    <span className="text-white font-medium">
                      {notional != null ? `₹${fmt2(notional)} Cr` : '—'}
                    </span>
                  </td>
                  <td className={`${tdCls} w-28`}>
                    {numInput(mr, v => setSubMargins(prev => ({ ...prev, [c]: v })), 0.01, 0)}
                  </td>
                  <td className={tdCls}>
                    <span className="text-white font-medium">
                      {marginAmt != null ? `₹${fmt2(marginAmt)} Cr` : '—'}
                    </span>
                  </td>
                </tr>
              )
            })}

            {/* ABLBL note row if selected */}
            {ablblSelected && (
              <tr className="border-b border-slate-800 bg-slate-800/20">
                <td className={`${tdCls} text-left`}>
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded text-xs border border-slate-600 text-slate-500">—</span>
                    <div>
                      <div className="text-slate-400 font-medium">ABLBL</div>
                      <div className="text-xs text-slate-500">{LABELS['ABLBL']}</div>
                    </div>
                  </div>
                </td>
                <td colSpan={6} className="px-4 py-3 text-xs text-slate-500 text-left">
                  Not available in F&amp;O — excluded from sizing
                </td>
              </tr>
            )}

            {/* TOTAL row */}
            <tr className="border-t-2 border-slate-600 bg-slate-800/40">
              <td className={`${tdCls} text-left font-bold text-slate-200`}>TOTAL</td>
              <td className={tdCls}>—</td>
              <td className={tdCls}>—</td>
              <td className={tdCls}>—</td>
              <td className={tdCls}>
                <span className="font-bold text-white text-base">
                  {grasimNotional != null && totalSubNotional != null
                    ? `₹${fmt2(grasimNotional + totalSubNotional)} Cr`
                    : '—'}
                </span>
              </td>
              <td className={tdCls}>—</td>
              <td className={tdCls}>
                <span className="font-bold text-white text-base">
                  {totalMargin != null ? `₹${fmt2(totalMargin)} Cr` : '—'}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-4 flex-wrap">
        {imbPct != null && <ImbBadge pct={imbPct} />}
        {Object.values(manualSubLots).some(Boolean) && (
          <span className="text-xs text-amber-400 italic">Some lots manually set — auto-sizing paused for those legs</span>
        )}
      </div>

      <p className="text-xs text-slate-600 border-t border-slate-800 pt-4">
        NRML margin rates sourced from Zerodha Margin Calculator as of Apr 2026 (GRASIM 17.75%, ULTRACEMCO 18.57%, ABCAPITAL 36.15%).
        Actual margins vary by expiry and market conditions.{' '}
        <span className="text-slate-500">Verify at zerodha.com/margin-calculator before trading.</span>
      </p>
    </div>
  )
}
