'use client'

import { useState, useEffect, useMemo } from 'react'
import type { LiveSpreadData } from '@/types'

interface Props {
  liveData: LiveSpreadData | null
  currentZ: number | null
}

const DEFAULT_LOT_SIZE_FIN    = 750
const DEFAULT_LOT_SIZE_FINSV  = 250
const DEFAULT_MARGIN_RATE_FIN   = 18.84  // % NRML — Zerodha, 29 Mar 2026
const DEFAULT_MARGIN_RATE_FINSV = 17.78  // % NRML — Zerodha, 29 Mar 2026
const CR = 1_00_00_000

/** Find (lotsLong, lotsShort) ∈ 1..20 that minimises notional imbalance. */
function calcAutoLots(
  priceLong: number, lotSizeLong: number,
  priceShort: number, lotSizeShort: number,
): [number, number] {
  let bestLong = 1, bestShort = 1, bestImb = Infinity
  for (let n = 1; n <= 20; n++) {
    const notionalLong  = priceLong  * n * lotSizeLong
    const shortLots = Math.max(1, Math.round(notionalLong / (priceShort * lotSizeShort)))
    const notionalShort = priceShort * shortLots * lotSizeShort
    const imb = Math.abs(notionalLong - notionalShort) / Math.max(notionalLong, notionalShort)
    if (imb < bestImb) { bestImb = imb; bestLong = n; bestShort = shortLots }
  }
  return [bestLong, bestShort]
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

export default function TradeSetupTab({ liveData, currentZ }: Props) {
  // Direction: signal-driven default
  const signalDir = (currentZ == null || currentZ <= 0) ? 'long-finsv' : 'long-fin'
  const [direction, setDirection] = useState<'long-finsv' | 'long-fin'>(signalDir)

  // Lot sizes
  const [lotSizeFin,   setLotSizeFin]   = useState(DEFAULT_LOT_SIZE_FIN)
  const [lotSizeFinsv, setLotSizeFinsv] = useState(DEFAULT_LOT_SIZE_FINSV)

  // Lots — auto-computed initially
  const [lotsLong,  setLotsLong]  = useState(1)
  const [lotsShort, setLotsShort] = useState(1)
  const [manualOverride, setManualOverride] = useState(false)

  // Margin rates
  const [marginRateFin,   setMarginRateFin]   = useState(DEFAULT_MARGIN_RATE_FIN)
  const [marginRateFinsv, setMarginRateFinsv] = useState(DEFAULT_MARGIN_RATE_FINSV)

  // Manual price overrides
  const [manualPriceFinSV, setManualPriceFinSV] = useState<number | null>(null)
  const [manualPriceFin,   setManualPriceFin]   = useState<number | null>(null)

  const priceFinsv = liveData?.finsv.price ?? null
  const priceFin   = liveData?.fin.price   ?? null

  // Effective prices — live unless user has overridden
  const effectiveFinSV = manualPriceFinSV ?? priceFinsv
  const effectiveFin   = manualPriceFin   ?? priceFin

  const isPriceManual = manualPriceFinSV != null || manualPriceFin != null

  // Recompute spread from effective prices using mcap scaling
  const computedSpread = useMemo(() => {
    if (!liveData) return null
    if (!effectiveFinSV || !effectiveFin) return liveData.spread_pct
    const newFinSVMcap = liveData.finsv.mcap * (effectiveFinSV / liveData.finsv.price)
    const newFinMcap   = liveData.fin.mcap   * (effectiveFin   / liveData.fin.price)
    const residual     = newFinSVMcap - (liveData.stake_pct / 100) * newFinMcap
    return newFinSVMcap > 0 ? (residual / newFinSVMcap) * 100 : null
  }, [effectiveFinSV, effectiveFin, liveData])

  // Determine long/short effective prices & rates based on direction
  const priceLong  = direction === 'long-finsv' ? effectiveFinSV : effectiveFin
  const priceShort = direction === 'long-finsv' ? effectiveFin   : effectiveFinSV
  const lotSizeLong  = direction === 'long-finsv' ? lotSizeFinsv : lotSizeFin
  const lotSizeShort = direction === 'long-finsv' ? lotSizeFin   : lotSizeFinsv
  const marginRateLong  = direction === 'long-finsv' ? marginRateFinsv : marginRateFin
  const marginRateShort = direction === 'long-finsv' ? marginRateFin   : marginRateFinsv
  const tickerLong  = direction === 'long-finsv' ? 'BAJAJFINSV' : 'BAJFINANCE'
  const tickerShort = direction === 'long-finsv' ? 'BAJFINANCE'  : 'BAJAJFINSV'

  // Auto-compute lots when prices or lot sizes change (unless user overrode)
  useEffect(() => {
    if (manualOverride) return
    if (!priceLong || !priceShort) return
    const [nl, ns] = calcAutoLots(priceLong, lotSizeLong, priceShort, lotSizeShort)
    setLotsLong(nl)
    setLotsShort(ns)
  }, [priceLong, priceShort, lotSizeLong, lotSizeShort, manualOverride])

  // Re-derive direction when currentZ changes (only if user hasn't toggled)
  const [userToggledDir, setUserToggledDir] = useState(false)
  useEffect(() => {
    if (userToggledDir) return
    setDirection((currentZ == null || currentZ <= 0) ? 'long-finsv' : 'long-fin')
  }, [currentZ, userToggledDir])

  function handleFlip() {
    setDirection(d => d === 'long-finsv' ? 'long-fin' : 'long-finsv')
    setUserToggledDir(true)
    setManualOverride(false) // re-run auto lot calc for new direction
  }

  function handleReset() {
    setLotSizeFin(DEFAULT_LOT_SIZE_FIN)
    setLotSizeFinsv(DEFAULT_LOT_SIZE_FINSV)
    setMarginRateFin(DEFAULT_MARGIN_RATE_FIN)
    setMarginRateFinsv(DEFAULT_MARGIN_RATE_FINSV)
    setManualOverride(false)
    setUserToggledDir(false)
    setDirection((currentZ == null || currentZ <= 0) ? 'long-finsv' : 'long-fin')
    setManualPriceFinSV(null)
    setManualPriceFin(null)
  }

  // Computed amounts & margins
  const amountLong  = priceLong  != null ? (priceLong  * lotsLong  * lotSizeLong)  / CR : null
  const amountShort = priceShort != null ? (priceShort * lotsShort * lotSizeShort) / CR : null
  const marginLong  = amountLong  != null ? amountLong  * marginRateLong  / 100 : null
  const marginShort = amountShort != null ? amountShort * marginRateShort / 100 : null

  const totalAmount = amountLong != null && amountShort != null ? amountLong + amountShort : null
  const totalMargin = marginLong != null && marginShort != null ? marginLong + marginShort : null

  const imbPct = amountLong != null && amountShort != null
    ? Math.abs(amountLong - amountShort) / Math.max(amountLong, amountShort) * 100
    : null

  function editableNum(
    value: number,
    onChange: (v: number) => void,
    onManual?: () => void,
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
          if (!isNaN(v) && v >= min) { onChange(v); onManual?.() }
        }}
        className="w-full bg-slate-800 border border-slate-600 text-white text-sm rounded px-2 py-1 focus:outline-none focus:border-blue-500 text-right"
      />
    )
  }

  const thCls = 'text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 text-right first:text-left'
  const tdCls = 'px-4 py-3 text-sm text-right'

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-white">Trade Setup</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Futures pair trade sizing · Prices from NSE cash market (live)
          </p>
          {computedSpread != null && (
            <div className="inline-flex items-center gap-3 mt-3 px-4 py-2 rounded-full border bg-slate-800/80"
              style={{ borderColor: computedSpread < 0 ? 'rgb(22 163 74 / 0.5)' : 'rgb(220 38 38 / 0.5)' }}>
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Live Spread</span>
              <span className={`text-xl font-bold tabular-nums ${computedSpread < 0 ? 'text-green-400' : 'text-red-400'}`}>
                {computedSpread > 0 ? '+' : ''}{computedSpread.toFixed(2)}%
              </span>
              {isPriceManual
                ? <span className="text-xs text-amber-400 font-medium">● manual</span>
                : <span className="text-xs text-slate-500">● live</span>
              }
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Direction badge + flip */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Direction:</span>
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-600/20 text-green-400 border border-green-700">
              LONG {tickerLong}
            </span>
            <span className="text-slate-600">/</span>
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-600/20 text-red-400 border border-red-700">
              SHORT {tickerShort}
            </span>
            <button
              onClick={handleFlip}
              className="text-xs px-2.5 py-1 rounded border border-slate-600 bg-slate-800 text-slate-300 hover:text-white hover:border-slate-400 transition-colors"
              title="Flip long/short legs"
            >
              ⇄ Flip
            </button>
            {userToggledDir && (
              <span className="text-xs text-amber-400 italic">manual</span>
            )}
          </div>
          {/* Z-score context */}
          {currentZ != null && (
            <span className="text-xs text-slate-500">
              Z({'\u00A0'}2Y{'\u00A0'}) = <span className={`font-medium ${currentZ < 0 ? 'text-green-400' : 'text-red-400'}`}>{currentZ > 0 ? '+' : ''}{currentZ.toFixed(2)}</span>
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
              <th className={thCls}>No. of Shares</th>
              <th className={thCls}>Amount (₹ Cr)</th>
              <th className={thCls}>Margin Rate %</th>
              <th className={thCls}>Margin (₹ Cr)</th>
            </tr>
          </thead>
          <tbody>
            {/* LONG row */}
            <tr className="border-b border-slate-800">
              <td className={`${tdCls} text-left`}>
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-green-600/20 text-green-400 border border-green-700">L</span>
                  <span className="text-white font-medium">{tickerLong}</span>
                </div>
              </td>
              <td className={`${tdCls} w-32`}>
                {editableNum(
                  priceLong ?? 0,
                  (v) => direction === 'long-finsv' ? setManualPriceFinSV(v) : setManualPriceFin(v),
                  undefined, 0.01, 0.01,
                )}
              </td>
              <td className={`${tdCls} w-24`}>
                {editableNum(
                  direction === 'long-finsv' ? lotSizeFinsv : lotSizeFin,
                  direction === 'long-finsv'
                    ? (v) => setLotSizeFinsv(v)
                    : (v) => setLotSizeFin(v),
                )}
              </td>
              <td className={`${tdCls} w-24`}>
                {editableNum(lotsLong, setLotsLong, () => setManualOverride(true))}
              </td>
              <td className={tdCls}>
                <span className="text-slate-300 font-mono">{(lotsLong * lotSizeLong).toLocaleString('en-IN')}</span>
              </td>
              <td className={tdCls}>
                <span className="text-white font-medium">
                  {amountLong != null ? `₹${fmt2(amountLong)} Cr` : '—'}
                </span>
              </td>
              <td className={`${tdCls} w-28`}>
                {editableNum(
                  direction === 'long-finsv' ? marginRateFinsv : marginRateFin,
                  direction === 'long-finsv'
                    ? setMarginRateFinsv
                    : setMarginRateFin,
                  undefined, 0.01, 0,
                )}
              </td>
              <td className={tdCls}>
                <span className="text-white font-medium">
                  {marginLong != null ? `₹${fmt2(marginLong)} Cr` : '—'}
                </span>
              </td>
            </tr>

            {/* SHORT row */}
            <tr className="border-b border-slate-700">
              <td className={`${tdCls} text-left`}>
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-red-600/20 text-red-400 border border-red-700">S</span>
                  <span className="text-white font-medium">{tickerShort}</span>
                </div>
              </td>
              <td className={`${tdCls} w-32`}>
                {editableNum(
                  priceShort ?? 0,
                  (v) => direction === 'long-finsv' ? setManualPriceFin(v) : setManualPriceFinSV(v),
                  undefined, 0.01, 0.01,
                )}
              </td>
              <td className={`${tdCls} w-24`}>
                {editableNum(
                  direction === 'long-finsv' ? lotSizeFin : lotSizeFinsv,
                  direction === 'long-finsv'
                    ? (v) => setLotSizeFin(v)
                    : (v) => setLotSizeFinsv(v),
                )}
              </td>
              <td className={`${tdCls} w-24`}>
                {editableNum(lotsShort, setLotsShort, () => setManualOverride(true))}
              </td>
              <td className={tdCls}>
                <span className="text-slate-300 font-mono">{(lotsShort * lotSizeShort).toLocaleString('en-IN')}</span>
              </td>
              <td className={tdCls}>
                <span className="text-white font-medium">
                  {amountShort != null ? `₹${fmt2(amountShort)} Cr` : '—'}
                </span>
              </td>
              <td className={`${tdCls} w-28`}>
                {editableNum(
                  direction === 'long-finsv' ? marginRateFin : marginRateFinsv,
                  direction === 'long-finsv'
                    ? setMarginRateFin
                    : setMarginRateFinsv,
                  undefined, 0.01, 0,
                )}
              </td>
              <td className={tdCls}>
                <span className="text-white font-medium">
                  {marginShort != null ? `₹${fmt2(marginShort)} Cr` : '—'}
                </span>
              </td>
            </tr>

            {/* TOTAL row */}
            <tr className="border-t-2 border-slate-600 bg-slate-800/40">
              <td className={`${tdCls} text-left font-bold text-slate-200`}>TOTAL</td>
              <td className={tdCls}>—</td>
              <td className={tdCls}>—</td>
              <td className={tdCls}>—</td>
              <td className={tdCls}>—</td>
              <td className={tdCls}>
                <span className="font-bold text-white text-base">
                  {totalAmount != null ? `₹${fmt2(totalAmount)} Cr` : '—'}
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
        {manualOverride && (
          <span className="text-xs text-amber-400 italic">Lots manually set — auto-sizing paused</span>
        )}
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-slate-600 border-t border-slate-800 pt-4">
        NRML margin rates sourced from Zerodha Margin Calculator as of 29 Mar 2026 (BAJFINANCE 18.84%, BAJAJFINSV 17.78%).
        Actual margins vary by expiry and market conditions.{' '}
        <span className="text-slate-500">Verify at zerodha.com/margin-calculator before trading.</span>
      </p>
    </div>
  )
}
