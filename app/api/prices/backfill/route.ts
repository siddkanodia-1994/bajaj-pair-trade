import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, fetchShareHistory } from '@/lib/supabase'
import type { ShareHistoryRow } from '@/types'

export const dynamic = 'force-dynamic'

const CRORE = 10_000_000
// Dhan timestamps are IST-epoch; offset to derive correct IST date
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

function applicableShares(shareHistory: ShareHistoryRow[], date: string, company: string): number | null {
  const row = [...shareHistory]
    .filter(s => s.company === company && s.effective_date <= date)
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0]
  return row?.shares ?? null
}

async function fetchDhanHistorical(
  securityId: string,
  fromDate: string,
  toDate: string,
  accessToken: string,
  clientId: string,
): Promise<{ date: string; close: number }[]> {
  const res = await fetch('https://api.dhan.co/v2/charts/historical', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'access-token': accessToken,
      'client-id': clientId,
    },
    body: JSON.stringify({
      securityId,
      exchangeSegment: 'NSE_EQ',
      instrument: 'EQUITY',
      fromDate,
      toDate,
    }),
  })

  if (!res.ok) return []

  const data = await res.json()
  const closes: number[] = data.close ?? []
  // Dhan returns either 'start_Time' or 'timestamp' depending on version
  const timestamps: number[] = data.start_Time ?? data.timestamp ?? []

  return closes.map((close, i) => {
    const dateIST = new Date(timestamps[i] * 1000 + IST_OFFSET_MS).toISOString().slice(0, 10)
    return { date: dateIST, close }
  })
}

async function runBackfill(fromDate: string, toDate: string) {
  const db = createServerClient()

  const { data: tokenRow } = await db.from('dhan_tokens').select('access_token').eq('id', 1).single()
  const accessToken = (tokenRow?.access_token as string | undefined) ?? process.env.DHAN_ACCESS_TOKEN ?? ''
  const clientId = process.env.DHAN_CLIENT_ID ?? ''

  if (!accessToken || !clientId) {
    return NextResponse.json({ error: 'Dhan credentials not configured' }, { status: 500 })
  }

  const [finCandles, finsvCandles] = await Promise.all([
    fetchDhanHistorical('317',   fromDate, toDate, accessToken, clientId),
    fetchDhanHistorical('16675', fromDate, toDate, accessToken, clientId),
  ])

  if (!finCandles.length || !finsvCandles.length) {
    return NextResponse.json({ error: 'Dhan historical API returned no data' }, { status: 502 })
  }

  const finByDate   = new Map(finCandles.map(c => [c.date, c.close]))
  const finsvByDate = new Map(finsvCandles.map(c => [c.date, c.close]))

  const { data: existing } = await db
    .from('eod_prices')
    .select('date')
    .gte('date', fromDate)
    .lte('date', toDate)
  const existingDates = new Set((existing ?? []).map((r: { date: string }) => r.date))

  const shareHistory = await fetchShareHistory()

  const rows: {
    date: string
    fin_price: number
    fin_mcap: number
    finsv_price: number
    finsv_mcap: number
    source: string
  }[] = []

  for (const [date, finPrice] of finByDate) {
    if (existingDates.has(date)) continue
    const finsvPrice = finsvByDate.get(date)
    if (!finsvPrice) continue

    const finShares   = applicableShares(shareHistory, date, 'BAJFINANCE')
    const finsvShares = applicableShares(shareHistory, date, 'BAJAJFINSV')
    if (!finShares || !finsvShares) continue

    rows.push({
      date,
      fin_price:   finPrice,
      fin_mcap:    (finPrice   * finShares)   / CRORE,
      finsv_price: finsvPrice,
      finsv_mcap:  (finsvPrice * finsvShares) / CRORE,
      source:      'dhan_historical',
    })
  }

  rows.sort((a, b) => a.date.localeCompare(b.date))

  if (rows.length === 0) {
    return NextResponse.json({ success: true, inserted: 0, message: 'No missing dates found in range' })
  }

  const { error } = await db.from('eod_prices').upsert(rows, { onConflict: 'date' })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    inserted: rows.length,
    dates: rows.map(r => r.date),
    rows: rows.map(r => ({ date: r.date, fin_price: r.fin_price, finsv_price: r.finsv_price })),
  })
}

// GET: browser-navigable — owner visits URL directly to trigger backfill
// e.g. /api/prices/backfill?fromDate=2026-05-27&toDate=2026-06-08
export async function GET(req: NextRequest) {
  const jar = await cookies()
  if (jar.get('bajaj_owner')?.value !== '1') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { searchParams } = new URL(req.url)
  const fromDate = searchParams.get('fromDate')
  const toDate   = searchParams.get('toDate')
  if (!fromDate || !toDate) {
    return NextResponse.json({ error: 'fromDate and toDate query params required (YYYY-MM-DD)' }, { status: 400 })
  }
  return runBackfill(fromDate, toDate)
}

export async function POST(req: NextRequest) {
  const jar = await cookies()
  if (jar.get('bajaj_owner')?.value !== '1') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { fromDate?: string; toDate?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { fromDate, toDate } = body
  if (!fromDate || !toDate) {
    return NextResponse.json({ error: 'fromDate and toDate required (YYYY-MM-DD)' }, { status: 400 })
  }

  return runBackfill(fromDate, toDate)
}
