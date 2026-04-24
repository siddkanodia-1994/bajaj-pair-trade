import { NextRequest, NextResponse } from 'next/server'
import { getDhanLivePrices } from '@/lib/dhan'
import { getDhanGrasimPrices } from '@/lib/dhan-grasim'
import { getApplicableStake, computeFixedWindowStats } from '@/lib/spread-calculator'
import { getApplicableGrasimStakes } from '@/lib/grasim-spread-calculator'
import { supabase, fetchLatestShares, createServerClient } from '@/lib/supabase'
import { fetchLatestGrasimShares, fetchGrasimStakes, createServerClient as createGrasimServerClient } from '@/lib/supabase-grasim'
import { GRASIM_DEFAULT_SELECTION } from '@/types/grasim'
import type { GrasimStakeRow } from '@/types/grasim'
import type { StakeHistoryRow } from '@/types'
import { sendTelegramAlert } from '@/lib/telegram'

export const dynamic = 'force-dynamic'

const CRORE = 10_000_000

// Map window key → approximate trading days for z-score historical fetch
const WINDOW_TRADING_DAYS: Record<string, number> = {
  '1Y': 260, '2Y': 520, '3Y': 780, '4Y': 1040, '5Y': 1300,
}

// Mcap field names for Grasim subsidiaries (mirrors MCAP_FIELD in grasim-spread-calculator)
const GRASIM_MCAP_FIELDS: Record<string, string> = {
  ULTRACEMCO: 'ultracemco_mcap',
  ABCAPITAL:  'abcapital_mcap',
  IDEA:       'idea_mcap',
  HINDALCO:   'hindalco_mcap',
  ABFRL:      'abfrl_mcap',
  ABLBL:      'ablbl_mcap',
}

/** NSE market hours: 9:15 AM – 3:30 PM IST, Mon–Fri */
function isMarketOpen(): boolean {
  const now = new Date()
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
  const day = ist.getUTCDay()
  if (day === 0 || day === 6) return false
  const totalMinutes = ist.getUTCHours() * 60 + ist.getUTCMinutes()
  return totalMinutes >= 9 * 60 + 15 && totalMinutes <= 15 * 60 + 30
}

function meetsCondition(value: number, op: string, threshold: number): boolean {
  return op === '<=' ? value <= threshold : value >= threshold
}

export async function GET(req: NextRequest) {
  // Vercel cron passes Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers.get('authorization')
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isMarketOpen()) {
    return NextResponse.json({ success: true, skipped: true, reason: 'outside_market_hours' })
  }

  const now = new Date()
  const istOffset = 5.5 * 60 * 60 * 1000
  const istNow = new Date(now.getTime() + istOffset)
  const istDate = istNow.toISOString().split('T')[0]
  const tickTime = now.toISOString()

  const db = createServerClient()
  const errors: string[] = []
  let bajajSpread: number | null = null
  let grasimSpread: number | null = null
  let bajajStakes: StakeHistoryRow[] | null = null
  let grasimStakesData: GrasimStakeRow[] | null = null

  // ── Bajaj ────────────────────────────────────────────────────────────────
  try {
    const [dhanPrices, shares, { data: stakes }] = await Promise.all([
      getDhanLivePrices(),
      fetchLatestShares(),
      supabase
        .from('stake_history')
        .select('*')
        .order('quarter_end_date', { ascending: false })
        .limit(10),
    ])

    bajajStakes = stakes ?? null

    if (dhanPrices.fin > 0 && dhanPrices.finsv > 0 && shares.fin > 0 && shares.finsv > 0) {
      const stake_pct = getApplicableStake(istDate, stakes ?? [])
      const stake_fraction = stake_pct / 100
      const fin_mcap   = (dhanPrices.fin   * shares.fin)   / CRORE
      const finsv_mcap = (dhanPrices.finsv * shares.finsv) / CRORE
      const residual   = finsv_mcap - stake_fraction * fin_mcap
      const spread_pct = finsv_mcap > 0 ? (residual / finsv_mcap) * 100 : 0
      bajajSpread = spread_pct

      const { error } = await db
        .from('intraday_prices')
        .upsert([{
          date:        istDate,
          tick_time:   tickTime,
          fin_price:   dhanPrices.fin,
          finsv_price: dhanPrices.finsv,
          spread_pct,
        }], { onConflict: 'tick_time' })

      if (error) errors.push(`bajaj: ${error.message}`)
    }
  } catch (err) {
    errors.push(`bajaj: ${String(err)}`)
  }

  // ── Grasim ───────────────────────────────────────────────────────────────
  try {
    const [grasimPrices, shares, stakes] = await Promise.all([
      getDhanGrasimPrices(),
      fetchLatestGrasimShares(),
      fetchGrasimStakes(),
    ])

    grasimStakesData = stakes

    if (grasimPrices.GRASIM > 0) {
      const stakeMap = getApplicableGrasimStakes(istDate, stakes, GRASIM_DEFAULT_SELECTION)
      const grasim_mcap = (grasimPrices.GRASIM * (shares['GRASIM'] ?? 0)) / CRORE

      let basket_mcap = 0
      for (const company of GRASIM_DEFAULT_SELECTION) {
        const shareCount = shares[company] ?? 0
        const price      = grasimPrices[company as keyof typeof grasimPrices] ?? 0
        const mcap       = shareCount > 0 ? (price * shareCount) / CRORE : 0
        basket_mcap += ((stakeMap[company] ?? 0) / 100) * mcap
      }

      const residual   = grasim_mcap - basket_mcap
      const spread_pct = grasim_mcap > 0 ? (residual / grasim_mcap) * 100 : 0
      grasimSpread = spread_pct

      const grasimDb = createGrasimServerClient()
      const { error } = await grasimDb
        .from('grasim_intraday_prices')
        .upsert([{
          date:      istDate,
          tick_time: tickTime,
          spread_pct,
        }], { onConflict: 'tick_time' })

      if (error) errors.push(`grasim: ${error.message}`)
    }
  } catch (err) {
    errors.push(`grasim: ${String(err)}`)
  }

  // ── Spread Alerts ─────────────────────────────────────────────────────────
  try {
    const alertDb = createServerClient()
    const { data: activeAlerts } = await alertDb
      .from('spread_alerts')
      .select('*')
      .or(`last_fired_date.is.null,last_fired_date.lt.${istDate}`)

    if (activeAlerts && activeAlerts.length > 0) {
      // ── Pre-compute z-scores if any alert needs them ──────────────────────
      const bajajZscores: Record<string, number | null> = {}
      const grasimZscores: Record<string, number | null> = {}

      const zscoreAlerts = activeAlerts.filter((a) => a.metric === 'zscore')

      // Bajaj z-scores
      if (bajajSpread != null && bajajStakes != null && zscoreAlerts.some((a) => a.pair !== 'grasim')) {
        const neededWindows = [...new Set(
          zscoreAlerts
            .filter((a) => a.pair === 'bajaj' || a.pair === 'both')
            .map((a) => a.window_key ?? '1Y')
        )]
        if (neededWindows.length > 0) {
          const maxRows = Math.max(...neededWindows.map((w) => WINDOW_TRADING_DAYS[w] ?? 260))
          const { data: eodRows } = await alertDb
            .from('eod_prices')
            .select('date, fin_mcap, finsv_mcap')
            .order('date', { ascending: false })
            .limit(maxRows)

          if (eodRows && eodRows.length >= 2) {
            const spreads = [...eodRows].reverse().map((row) => {
              const stakePct = getApplicableStake(row.date, bajajStakes!)
              const stakeFrac = stakePct / 100
              return row.finsv_mcap > 0
                ? ((row.finsv_mcap - stakeFrac * row.fin_mcap) / row.finsv_mcap) * 100
                : 0
            })
            for (const wKey of neededWindows) {
              const wRows = WINDOW_TRADING_DAYS[wKey] ?? 260
              const slice = spreads.slice(-wRows)
              bajajZscores[wKey] = computeFixedWindowStats(slice, bajajSpread).zscore
            }
          }
        }
      }

      // Grasim z-scores
      if (grasimSpread != null && grasimStakesData != null && zscoreAlerts.some((a) => a.pair !== 'bajaj')) {
        const neededWindows = [...new Set(
          zscoreAlerts
            .filter((a) => a.pair === 'grasim' || a.pair === 'both')
            .map((a) => a.window_key ?? '1Y')
        )]
        if (neededWindows.length > 0) {
          const maxRows = Math.max(...neededWindows.map((w) => WINDOW_TRADING_DAYS[w] ?? 260))
          const { data: grasimEodRows } = await createGrasimServerClient()
            .from('grasim_eod_prices')
            .select('*')
            .order('date', { ascending: false })
            .limit(maxRows)

          if (grasimEodRows && grasimEodRows.length >= 2) {
            const spreads = [...grasimEodRows].reverse().map((row) => {
              const stakeMap = getApplicableGrasimStakes(row.date, grasimStakesData!, GRASIM_DEFAULT_SELECTION)
              let basket_mcap = 0
              for (const company of GRASIM_DEFAULT_SELECTION) {
                const stakePct = stakeMap[company] ?? 0
                const mcap = (row as Record<string, number>)[GRASIM_MCAP_FIELDS[company]] ?? 0
                basket_mcap += (stakePct / 100) * mcap
              }
              return row.grasim_mcap > 0
                ? ((row.grasim_mcap - basket_mcap) / row.grasim_mcap) * 100
                : 0
            })
            for (const wKey of neededWindows) {
              const wRows = WINDOW_TRADING_DAYS[wKey] ?? 260
              const slice = spreads.slice(-wRows)
              grasimZscores[wKey] = computeFixedWindowStats(slice, grasimSpread).zscore
            }
          }
        }
      }

      // ── Evaluate each alert ───────────────────────────────────────────────
      for (const alert of activeAlerts) {
        const op     = alert.operator   ?? '>='
        const metric = alert.metric     ?? 'spread_pct'
        const wKey   = alert.window_key ?? '1Y'

        let shouldFire = false
        let currentValue: number | null = null

        if (alert.pair === 'bajaj') {
          const val = metric === 'zscore' ? (bajajZscores[wKey] ?? null) : bajajSpread
          if (val != null) { shouldFire = meetsCondition(val, op, alert.threshold_pct); currentValue = val }
        } else if (alert.pair === 'grasim') {
          const val = metric === 'zscore' ? (grasimZscores[wKey] ?? null) : grasimSpread
          if (val != null) { shouldFire = meetsCondition(val, op, alert.threshold_pct); currentValue = val }
        } else if (alert.pair === 'both') {
          const bajajVal  = metric === 'zscore' ? (bajajZscores[wKey]  ?? null) : bajajSpread
          const grasimVal = metric === 'zscore' ? (grasimZscores[wKey] ?? null) : grasimSpread
          if (bajajVal != null && meetsCondition(bajajVal, op, alert.threshold_pct)) {
            shouldFire = true; currentValue = bajajVal
          } else if (grasimVal != null && meetsCondition(grasimVal, op, alert.threshold_pct)) {
            shouldFire = true; currentValue = grasimVal
          }
        }

        if (shouldFire && currentValue != null) {
          await sendTelegramAlert(alert.telegram_chat_id, alert.pair, alert.threshold_pct, currentValue, op, metric)
          await alertDb
            .from('spread_alerts')
            .update({ last_fired_date: istDate })
            .eq('id', alert.id)
        }
      }
    }
  } catch (err) {
    console.error('[alerts]', String(err))
  }

  if (errors.length > 0) {
    console.error('[/api/cron/intraday]', errors)
    return NextResponse.json({ error: errors.join('; ') }, { status: 500 })
  }

  return NextResponse.json({ success: true, tick_time: tickTime })
}
