import { supabase } from './supabase'

// Dhan NSE_EQ security IDs (confirmed from Dhan scrip master)
export const GRASIM_DHAN_IDS = {
  GRASIM:     1232,
  ULTRACEMCO: 11532,
  ABCAPITAL:  21614,
  IDEA:       14366,
  HINDALCO:   1363,
  ABFRL:      30108,
  ABLBL:      756843,
} as const

export type GrasimDhanKey = keyof typeof GRASIM_DHAN_IDS

export type GrasimDhanPrices = Record<GrasimDhanKey, number>

const DHAN_LTP_URL = 'https://api.dhan.co/v2/marketfeed/ltp'
const ALL_IDS = Object.values(GRASIM_DHAN_IDS)
const ZERO_PRICES: GrasimDhanPrices = {
  GRASIM: 0, ULTRACEMCO: 0, ABCAPITAL: 0, IDEA: 0, HINDALCO: 0, ABFRL: 0, ABLBL: 0,
}

async function getToken(): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('dhan_tokens')
      .select('access_token')
      .eq('id', 1)
      .single()
    if (data?.access_token) return data.access_token
  } catch { /* fall through */ }
  return process.env.DHAN_ACCESS_TOKEN ?? null
}

// Per-instance in-memory cache (30s TTL)
let _memCache: { prices: GrasimDhanPrices; at: number } | null = null
const MEM_CACHE_TTL_MS = 30_000

/**
 * Fetch last traded prices for all 7 Grasim-universe tickers in one Dhan LTP call.
 * In-memory cache (30s) prevents redundant Dhan hits within the same serverless instance.
 * Returns zero for each ticker on any error — caller falls back to EOD.
 */
export async function getDhanGrasimPrices(): Promise<GrasimDhanPrices> {
  // In-memory cache
  if (_memCache && Date.now() - _memCache.at < MEM_CACHE_TTL_MS) {
    return _memCache.prices
  }

  const token    = await getToken()
  const clientId = process.env.DHAN_CLIENT_ID
  if (!token || !clientId) return { ...ZERO_PRICES }

  try {
    const res = await fetch(DHAN_LTP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access-token': token,
        'client-id': clientId,
      },
      body: JSON.stringify({ NSE_EQ: ALL_IDS }),
      cache: 'no-store',
    })

    if (!res.ok) {
      console.warn(`[dhan-grasim] HTTP ${res.status}: ${await res.text()}`)
      return { ...ZERO_PRICES }
    }

    const json = await res.json()
    const nse  = (json?.data?.NSE_EQ ?? {}) as Record<string, { last_price?: number }>

    const prices: GrasimDhanPrices = {
      GRASIM:     nse[String(GRASIM_DHAN_IDS.GRASIM)]?.last_price     ?? 0,
      ULTRACEMCO: nse[String(GRASIM_DHAN_IDS.ULTRACEMCO)]?.last_price ?? 0,
      ABCAPITAL:  nse[String(GRASIM_DHAN_IDS.ABCAPITAL)]?.last_price  ?? 0,
      IDEA:       nse[String(GRASIM_DHAN_IDS.IDEA)]?.last_price       ?? 0,
      HINDALCO:   nse[String(GRASIM_DHAN_IDS.HINDALCO)]?.last_price   ?? 0,
      ABFRL:      nse[String(GRASIM_DHAN_IDS.ABFRL)]?.last_price      ?? 0,
      ABLBL:      nse[String(GRASIM_DHAN_IDS.ABLBL)]?.last_price      ?? 0,
    }

    if (prices.GRASIM > 0) {
      _memCache = { prices, at: Date.now() }
    }

    return prices
  } catch (err) {
    console.warn('[dhan-grasim] fetch error', err)
    return { ...ZERO_PRICES }
  }
}
