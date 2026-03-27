import { supabase } from './supabase'

const BAJFINANCE_ID  = 317    // NSE_EQ: BAJFINANCE (Bajaj Finance Limited)
const BAJAJFINSV_ID  = 16675  // NSE_EQ: BAJAJFINSV (Bajaj Finserv Ltd.)

const DHAN_LTP_URL = 'https://api.dhan.co/v2/marketfeed/ltp'

export interface DhanLivePrices {
  fin: number   // BAJFINANCE last traded price (₹)
  finsv: number // BAJAJFINSV last traded price (₹)
}

/**
 * Read the active Dhan access token.
 * Prefers the Supabase-stored token (auto-renewed daily by cron).
 * Falls back to DHAN_ACCESS_TOKEN env var on first setup.
 */
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

// Per-instance in-memory cache (secondary layer on top of Supabase)
let _memCache: { prices: DhanLivePrices; at: number } | null = null
const MEM_CACHE_TTL_MS = 30_000

/**
 * Fetch last traded prices for BAJFINANCE and BAJAJFINSV from Dhan API.
 *
 * Rate-limit protection (Dhan allows 1 req/second):
 *  1. Supabase global cache — shared across all serverless instances.
 *     Only the first request in any 30-second window actually hits Dhan.
 *  2. In-memory cache — secondary layer per instance to skip Supabase read
 *     on back-to-back requests within the same warm function.
 *
 * Returns { fin: 0, finsv: 0 } on any error (caller falls back to EOD).
 */
export async function getDhanLivePrices(): Promise<DhanLivePrices> {
  // --- Layer 1: in-memory cache (fastest, per-instance) ---
  if (_memCache && Date.now() - _memCache.at < MEM_CACHE_TTL_MS) {
    return _memCache.prices
  }

  // --- Layer 2: Supabase global cache (shared across instances) ---
  const { data: cached } = await supabase
    .from('dhan_tokens')
    .select('fin_price, finsv_price, prices_fetched_at')
    .eq('id', 1)
    .single()

  const cacheAge = cached?.prices_fetched_at
    ? Date.now() - new Date(cached.prices_fetched_at).getTime()
    : Infinity

  if (cacheAge < 30_000 && cached?.fin_price && cached?.finsv_price) {
    const prices = { fin: Number(cached.fin_price), finsv: Number(cached.finsv_price) }
    _memCache = { prices, at: Date.now() }
    return prices
  }

  // --- Layer 3: live Dhan API call ---
  const token    = await getToken()
  const clientId = process.env.DHAN_CLIENT_ID
  if (!token || !clientId) return { fin: 0, finsv: 0 }

  try {
    const res = await fetch(DHAN_LTP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access-token': token,
        'client-id': clientId,
      },
      body: JSON.stringify({ NSE_EQ: [BAJFINANCE_ID, BAJAJFINSV_ID] }),
      cache: 'no-store',
    })

    if (!res.ok) {
      console.warn(`[dhan] HTTP ${res.status}: ${await res.text()}`)
      return { fin: 0, finsv: 0 }
    }

    const json = await res.json()
    const nse   = (json?.data?.NSE_EQ ?? {}) as Record<string, { last_price?: number }>
    const fin   = nse[String(BAJFINANCE_ID)]?.last_price  ?? 0
    const finsv = nse[String(BAJAJFINSV_ID)]?.last_price  ?? 0
    const prices = { fin, finsv }

    if (fin > 0 && finsv > 0) {
      // Update Supabase global cache (fire-and-forget; don't await to keep response fast)
      void supabase.from('dhan_tokens').upsert({
        id: 1,
        fin_price: fin,
        finsv_price: finsv,
        prices_fetched_at: new Date().toISOString(),
      })

      _memCache = { prices, at: Date.now() }
    }

    return prices
  } catch (err) {
    console.warn('[dhan] fetch error', err)
    return { fin: 0, finsv: 0 }
  }
}
