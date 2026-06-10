import { createServerClient, fetchShareHistory } from '@/lib/supabase'
import type { ShareHistoryRow } from '@/types'

const CRORE = 10_000_000
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

  return closes.map((close, i) => ({
    date: new Date(timestamps[i] * 1000 + IST_OFFSET_MS).toISOString().slice(0, 10),
    close,
  }))
}

export interface BackfillResult {
  inserted: number
  dates: string[]
  error?: string
}

export async function runBackfill(fromDate: string, toDate: string): Promise<BackfillResult> {
  const db = createServerClient()

  const { data: tokenRow } = await db.from('dhan_tokens').select('access_token').eq('id', 1).single()
  const accessToken = (tokenRow?.access_token as string | undefined) ?? process.env.DHAN_ACCESS_TOKEN ?? ''
  const clientId = process.env.DHAN_CLIENT_ID ?? ''

  if (!accessToken || !clientId) {
    return { inserted: 0, dates: [], error: 'Dhan credentials not configured' }
  }

  const [finCandles, finsvCandles] = await Promise.all([
    fetchDhanHistorical('317',   fromDate, toDate, accessToken, clientId),
    fetchDhanHistorical('16675', fromDate, toDate, accessToken, clientId),
  ])

  if (!finCandles.length || !finsvCandles.length) {
    return { inserted: 0, dates: [], error: 'Dhan historical API returned no data' }
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

  if (rows.length === 0) return { inserted: 0, dates: [] }

  const { error } = await db.from('eod_prices').upsert(rows, { onConflict: 'date' })
  if (error) return { inserted: 0, dates: [], error: error.message }

  return { inserted: rows.length, dates: rows.map(r => r.date) }
}
