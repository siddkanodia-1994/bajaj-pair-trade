import { NextRequest, NextResponse } from 'next/server'
import { getDhanLivePrices } from '@/lib/dhan'
import { getDhanGrasimPrices } from '@/lib/dhan-grasim'
import { getApplicableStake } from '@/lib/spread-calculator'
import { getApplicableGrasimStakes } from '@/lib/grasim-spread-calculator'
import { supabase, fetchLatestShares, createServerClient } from '@/lib/supabase'
import { fetchLatestGrasimShares, fetchGrasimStakes, createServerClient as createGrasimServerClient } from '@/lib/supabase-grasim'
import { GRASIM_DEFAULT_SELECTION } from '@/types/grasim'
import { sendSpreadAlert } from '@/lib/email'

export const dynamic = 'force-dynamic'

const CRORE = 10_000_000

/** NSE market hours: 9:15 AM – 3:30 PM IST, Mon–Fri */
function isMarketOpen(): boolean {
  const now = new Date()
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
  const day = ist.getUTCDay()
  if (day === 0 || day === 6) return false
  const totalMinutes = ist.getUTCHours() * 60 + ist.getUTCMinutes()
  return totalMinutes >= 9 * 60 + 15 && totalMinutes <= 15 * 60 + 30
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
    const { data: activeAlerts } = await supabase
      .from('spread_alerts')
      .select('*')
      .or(`last_fired_date.is.null,last_fired_date.lt.${istDate}`)

    if (activeAlerts && activeAlerts.length > 0) {
      for (const alert of activeAlerts) {
        let currentSpread: number | null = null
        let shouldFire = false

        if (alert.pair === 'bajaj' && bajajSpread != null) {
          currentSpread = bajajSpread
          shouldFire = bajajSpread >= alert.threshold_pct
        } else if (alert.pair === 'grasim' && grasimSpread != null) {
          currentSpread = grasimSpread
          shouldFire = grasimSpread >= alert.threshold_pct
        } else if (alert.pair === 'both') {
          if (bajajSpread != null && bajajSpread >= alert.threshold_pct) {
            currentSpread = bajajSpread
            shouldFire = true
          } else if (grasimSpread != null && grasimSpread >= alert.threshold_pct) {
            currentSpread = grasimSpread
            shouldFire = true
          }
        }

        if (shouldFire && currentSpread != null) {
          await sendSpreadAlert(alert.email, alert.pair, alert.threshold_pct, currentSpread)
          await supabase
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
