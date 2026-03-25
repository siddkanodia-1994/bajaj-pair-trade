// yahoo-finance2 v3: must use `new YahooFinance()` constructor
import YahooFinanceClass from 'yahoo-finance2'
import type { LiveQuote } from '@/types'

// yahoo-finance2 v3 Quote is a union; use a minimal interface for the fields we need
interface YFQuote {
  regularMarketPrice?: number
  marketCap?: number
  regularMarketChangePercent?: number
}

// Singleton instance
const yf = new YahooFinanceClass({ suppressNotices: ['yahooSurvey'] })

const FINSV = 'BAJAJFINSV.NS'
const FIN = 'BAJAJFINANCE.NS'
const CRORE = 10_000_000 // 1 crore = 10 million

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (err) {
      if (i === retries - 1) throw err
      await sleep(Math.pow(2, i) * 1000 + Math.random() * 400)
    }
  }
  throw new Error('Max retries exceeded')
}

function quoteToLive(q: YFQuote, ticker: string): LiveQuote {
  return {
    ticker,
    price: q.regularMarketPrice ?? 0,
    mcap: (q.marketCap ?? 0) / CRORE,
    change_pct: q.regularMarketChangePercent ?? 0,
    last_updated: new Date().toISOString(),
  }
}

// ---------- Live quotes ----------

export async function getLiveQuotes(): Promise<{ finsv: LiveQuote; fin: LiveQuote }> {
  const [fq, bq] = await Promise.all([
    withRetry(() => yf.quote(FINSV) as Promise<YFQuote>),
    withRetry(() => yf.quote(FIN) as Promise<YFQuote>),
  ])
  return { finsv: quoteToLive(fq, FINSV), fin: quoteToLive(bq, FIN) }
}

// ---------- Historical prices ----------

export interface HistoricalRow {
  date: string
  finsv_price: number
  finsv_mcap: number
  fin_price: number
  fin_mcap: number
}

export async function getHistoricalPrices(
  startDate: Date,
  endDate: Date
): Promise<HistoricalRow[]> {
  // Get current shares outstanding to approximate historical market cap
  const [fq, bq] = await Promise.all([
    withRetry(() => yf.quote(FINSV) as Promise<YFQuote>),
    withRetry(() => yf.quote(FIN) as Promise<YFQuote>),
  ])

  const finsvCurrentMcap  = fq.marketCap ?? 0
  const finCurrentMcap    = bq.marketCap ?? 0
  const finsvCurrentPrice = fq.regularMarketPrice ?? 1
  const finCurrentPrice   = bq.regularMarketPrice ?? 1
  const finsvShares = finsvCurrentMcap / finsvCurrentPrice
  const finShares   = finCurrentMcap   / finCurrentPrice

  // Fetch chart data (sequential to avoid rate limits)
  const finsvChart = await withRetry(() =>
    yf.chart(FINSV, { period1: startDate, period2: endDate, interval: '1d' })
  )
  await sleep(800)
  const finChart = await withRetry(() =>
    yf.chart(FIN, { period1: startDate, period2: endDate, interval: '1d' })
  )

  const finsvMap = new Map<string, number>()
  for (const q of finsvChart.quotes ?? []) {
    if (!q.date || !q.close) continue
    finsvMap.set(new Date(q.date).toISOString().split('T')[0], q.close)
  }

  const rows: HistoricalRow[] = []
  for (const q of finChart.quotes ?? []) {
    if (!q.date || !q.close) continue
    const d = new Date(q.date).toISOString().split('T')[0]
    const finsvPrice = finsvMap.get(d)
    if (!finsvPrice) continue
    rows.push({
      date: d,
      finsv_price: finsvPrice,
      finsv_mcap: (finsvPrice * finsvShares) / CRORE,
      fin_price: q.close,
      fin_mcap: (q.close * finShares) / CRORE,
    })
  }

  return rows.sort((a, b) => a.date.localeCompare(b.date))
}
