import { NextResponse } from 'next/server'
import { getDhanLivePrices } from '@/lib/dhan'
import { getApplicableStake } from '@/lib/spread-calculator'
import { supabase, fetchLatestShares } from '@/lib/supabase'
import type { LiveSpreadData, LiveQuote } from '@/types'

export const dynamic = 'force-dynamic'

const CRORE = 10_000_000
const MCAP_FROM_SHARES_CUTOFF = '2026-03-27'

/** NSE market hours: 9:15 AM – 3:30 PM IST, Mon–Fri */
function isMarketOpen(): boolean {
  const now = new Date()
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
  const day = ist.getUTCDay() // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false
  const totalMinutes = ist.getUTCHours() * 60 + ist.getUTCMinutes()
  return totalMinutes >= 9 * 60 + 15 && totalMinutes <= 15 * 60 + 30
}

export async function GET() {
  try {
    const [{ data: stakes }, shares, dhanPrices, { data: eodRows }] = await Promise.all([
      supabase
        .from('stake_history')
        .select('*')
        .order('quarter_end_date', { ascending: false })
        .limit(10),
      fetchLatestShares(),
      getDhanLivePrices(),
      supabase
        .from('eod_prices')
        .select('*')
        .order('date', { ascending: false })
        .limit(2),
    ])

    // Previous trading day close (used for change_pct during market hours)
    const prevEod = eodRows?.[0] ?? null

    let fin: LiveQuote
    let finsv: LiveQuote

    if (isMarketOpen() && dhanPrices.fin > 0 && dhanPrices.finsv > 0 && shares.fin > 0 && shares.finsv > 0) {
      // Market hours (9:15–15:30 IST): Dhan LTP × latest share count
      const finChangePct  = prevEod && prevEod.fin_price > 0   ? ((dhanPrices.fin   - prevEod.fin_price)   / prevEod.fin_price)   * 100 : 0
      const finsvChangePct = prevEod && prevEod.finsv_price > 0 ? ((dhanPrices.finsv - prevEod.finsv_price) / prevEod.finsv_price) * 100 : 0
      fin = {
        ticker: 'BAJFINANCE',
        price: dhanPrices.fin,
        mcap: (dhanPrices.fin * shares.fin) / CRORE,
        change_pct: finChangePct,
        last_updated: new Date().toISOString(),
      }
      finsv = {
        ticker: 'BAJAJFINSV',
        price: dhanPrices.finsv,
        mcap: (dhanPrices.finsv * shares.finsv) / CRORE,
        change_pct: finsvChangePct,
        last_updated: new Date().toISOString(),
      }
    } else {
      // After hours / holiday: show last EOD closing spread
      const eod = prevEod
      const eod2 = eodRows?.[1] ?? null  // day before, for change_pct

      if (!eod) {
        return NextResponse.json({ error: 'No live or EOD data available' }, { status: 502 })
      }

      const finChangePct  = eod2 && eod2.fin_price > 0   ? ((eod.fin_price   - eod2.fin_price)   / eod2.fin_price)   * 100 : 0
      const finsvChangePct = eod2 && eod2.finsv_price > 0 ? ((eod.finsv_price - eod2.finsv_price) / eod2.finsv_price) * 100 : 0

      // From cutoff onwards, compute MCap as price × shares (BSE data) — same logic as spread-calculator
      const useSharesMcap = eod.date >= MCAP_FROM_SHARES_CUTOFF && shares.fin > 0 && shares.finsv > 0
      fin = {
        ticker: 'BAJFINANCE',
        price: eod.fin_price,
        mcap: useSharesMcap ? (eod.fin_price * shares.fin) / CRORE : eod.fin_mcap,
        change_pct: finChangePct,
        last_updated: eod.date,
      }
      finsv = {
        ticker: 'BAJAJFINSV',
        price: eod.finsv_price,
        mcap: useSharesMcap ? (eod.finsv_price * shares.finsv) / CRORE : eod.finsv_mcap,
        change_pct: finsvChangePct,
        last_updated: eod.date,
      }
    }

    const today = new Date().toISOString().split('T')[0]
    const stake_pct = getApplicableStake(today, stakes ?? [])
    const stake_fraction = stake_pct / 100

    const underlying_stake_value = stake_fraction * fin.mcap
    const residual_value = finsv.mcap - underlying_stake_value
    const spread_pct = finsv.mcap > 0 ? (residual_value / finsv.mcap) * 100 : 0

    const payload: LiveSpreadData = {
      finsv,
      fin,
      stake_pct,
      underlying_stake_value,
      residual_value,
      spread_pct,
      as_of: new Date().toISOString(),
    }

    return NextResponse.json(payload)
  } catch (err) {
    console.error('[/api/prices/live]', err)
    return NextResponse.json({ error: 'Failed to fetch live quotes' }, { status: 502 })
  }
}
