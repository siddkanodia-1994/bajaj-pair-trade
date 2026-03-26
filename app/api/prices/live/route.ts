import { NextResponse } from 'next/server'
import { getDhanLivePrices } from '@/lib/dhan'
import { getLiveQuotes } from '@/lib/yahoo-finance'
import { getApplicableStake } from '@/lib/spread-calculator'
import { supabase, fetchLatestShares } from '@/lib/supabase'
import type { LiveSpreadData, LiveQuote } from '@/types'

export const dynamic = 'force-dynamic'

const CRORE = 10_000_000

export async function GET() {
  try {
    const [{ data: stakes }, shares, dhanPrices] = await Promise.all([
      supabase
        .from('stake_history')
        .select('*')
        .order('quarter_end_date', { ascending: false })
        .limit(10),
      fetchLatestShares(),
      getDhanLivePrices(),
    ])

    let fin: LiveQuote
    let finsv: LiveQuote

    // Use Dhan prices if available; fall back to Yahoo Finance
    if (dhanPrices.fin > 0 && dhanPrices.finsv > 0 && shares.fin > 0 && shares.finsv > 0) {
      fin = {
        ticker: 'BAJFINANCE',
        price: dhanPrices.fin,
        mcap: (dhanPrices.fin * shares.fin) / CRORE,
        change_pct: 0,
        last_updated: new Date().toISOString(),
      }
      finsv = {
        ticker: 'BAJAJFINSV',
        price: dhanPrices.finsv,
        mcap: (dhanPrices.finsv * shares.finsv) / CRORE,
        change_pct: 0,
        last_updated: new Date().toISOString(),
      }
    } else {
      // Fallback: Yahoo Finance (includes change_pct and Yahoo-derived mcap)
      const yahoo = await getLiveQuotes()
      fin   = yahoo.fin
      finsv = yahoo.finsv
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
