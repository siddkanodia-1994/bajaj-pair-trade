#!/usr/bin/env node
/**
 * One-time seed script: fetches 6 years of EOD prices from Yahoo Finance
 * and upserts them into Supabase eod_prices table.
 *
 * Run from project root:
 *   node scripts/seed.mjs
 */

import YahooFinanceClass from 'yahoo-finance2'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://abzfkjicqstrauejklel.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiemZramljcXN0cmF1ZWprbGVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MzI5ODMsImV4cCI6MjA5MDAwODk4M30.DGdmVnEfT_U1khehKJtiyJELr6cJn58mydruWm_DIdQ'

const FINSV = 'BAJAJFINSV.NS'
const FIN   = 'BAJFINANCE.NS'
const CRORE = 10_000_000

const yf = new YahooFinanceClass({ suppressNotices: ['yahooSurvey'] })
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function withRetry(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (err) {
      if (i === retries - 1) throw err
      const delay = Math.pow(2, i) * 1000 + Math.random() * 400
      console.log(`  Retry ${i + 1}/${retries - 1} after ${Math.round(delay)}ms...`)
      await sleep(delay)
    }
  }
}

async function main() {
  const yearsBack = 6
  const endDate = new Date()
  const startDate = new Date()
  startDate.setFullYear(startDate.getFullYear() - yearsBack)

  console.log(`\n[seed] Fetching ${yearsBack}yr history: ${startDate.toISOString().split('T')[0]} → ${endDate.toISOString().split('T')[0]}`)
  console.log('[seed] Step 1: Get current quotes for shares outstanding...')

  const fq = await withRetry(() => yf.quote(FINSV))
  await sleep(500)
  const bq = await withRetry(() => yf.quote(FIN))

  const finsvCurrentMcap  = fq.marketCap ?? 0
  const finCurrentMcap    = bq.marketCap ?? 0
  const finsvCurrentPrice = fq.regularMarketPrice ?? 1
  const finCurrentPrice   = bq.regularMarketPrice ?? 1
  const finsvShares = finsvCurrentMcap / finsvCurrentPrice
  const finShares   = finCurrentMcap   / finCurrentPrice

  console.log(`  FINSV: ₹${finsvCurrentPrice.toFixed(2)}, mcap ₹${(finsvCurrentMcap / CRORE).toFixed(0)} cr, shares ${(finsvShares / 1e6).toFixed(2)}M`)
  console.log(`  FIN:   ₹${finCurrentPrice.toFixed(2)}, mcap ₹${(finCurrentMcap / CRORE).toFixed(0)} cr, shares ${(finShares / 1e6).toFixed(2)}M`)

  console.log('\n[seed] Step 2: Fetching BAJAJFINSV.NS chart data...')
  const finsvChart = await withRetry(() =>
    yf.chart(FINSV, { period1: startDate, period2: endDate, interval: '1d' })
  )
  console.log(`  Got ${finsvChart.quotes?.length ?? 0} rows`)

  console.log('[seed] Waiting 1s to avoid rate limits...')
  await sleep(1000)

  console.log('[seed] Step 3: Fetching BAJFINANCE.NS chart data...')
  const finChart = await withRetry(() =>
    yf.chart(FIN, { period1: startDate, period2: endDate, interval: '1d' })
  )
  console.log(`  Got ${finChart.quotes?.length ?? 0} rows`)

  // Build FINSV map by date
  const finsvMap = new Map()
  for (const q of finsvChart.quotes ?? []) {
    if (!q.date || !q.close) continue
    finsvMap.set(new Date(q.date).toISOString().split('T')[0], q.close)
  }

  // Zip rows
  const rows = []
  for (const q of finChart.quotes ?? []) {
    if (!q.date || !q.close) continue
    const d = new Date(q.date).toISOString().split('T')[0]
    const finsvPrice = finsvMap.get(d)
    if (!finsvPrice) continue
    rows.push({
      date:        d,
      finsv_price: finsvPrice,
      finsv_mcap:  (finsvPrice * finsvShares) / CRORE,
      fin_price:   q.close,
      fin_mcap:    (q.close * finShares) / CRORE,
    })
  }
  rows.sort((a, b) => a.date.localeCompare(b.date))

  console.log(`\n[seed] Built ${rows.length} aligned rows. Sample (first/last):`)
  if (rows.length > 0) {
    const r0 = rows[0], rN = rows[rows.length - 1]
    console.log(`  First: ${r0.date}  FINSV=₹${r0.finsv_price.toFixed(2)} (${r0.finsv_mcap.toFixed(0)} cr)  FIN=₹${r0.fin_price.toFixed(2)} (${r0.fin_mcap.toFixed(0)} cr)`)
    console.log(`  Last:  ${rN.date}  FINSV=₹${rN.finsv_price.toFixed(2)} (${rN.finsv_mcap.toFixed(0)} cr)  FIN=₹${rN.fin_price.toFixed(2)} (${rN.fin_mcap.toFixed(0)} cr)`)
  }

  // Upsert in batches
  const BATCH = 500
  let inserted = 0
  console.log(`\n[seed] Upserting ${rows.length} rows in batches of ${BATCH}...`)
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await supabase
      .from('eod_prices')
      .upsert(batch, { onConflict: 'date' })
    if (error) {
      console.error(`  ERROR at batch ${i}: ${error.message}`)
      process.exit(1)
    }
    inserted += batch.length
    console.log(`  Upserted ${inserted}/${rows.length} rows`)
  }

  console.log(`\n[seed] Done! ${inserted} rows in eod_prices.`)

  // Quick verify
  const { count } = await supabase.from('eod_prices').select('*', { count: 'exact', head: true })
  console.log(`[seed] Supabase row count: ${count}`)
}

main().catch(err => {
  console.error('[seed] Fatal:', err)
  process.exit(1)
})
