const BAJFINANCE_ID  = 317    // NSE_EQ: BAJFINANCE (Bajaj Finance Limited)
const BAJAJFINSV_ID  = 16675  // NSE_EQ: BAJAJFINSV (Bajaj Finserv Ltd.)

const DHAN_LTP_URL = 'https://api.dhan.co/v2/marketfeed/ltp'

export interface DhanLivePrices {
  fin: number   // BAJFINANCE last traded price (₹)
  finsv: number // BAJAJFINSV last traded price (₹)
}

/**
 * Fetch last traded prices for BAJFINANCE and BAJAJFINSV from Dhan API.
 * Returns { fin: 0, finsv: 0 } on any error (caller should fall back to Yahoo).
 */
export async function getDhanLivePrices(): Promise<DhanLivePrices> {
  const token    = process.env.DHAN_ACCESS_TOKEN
  const clientId = process.env.DHAN_CLIENT_ID
  if (!token || !clientId) return { fin: 0, finsv: 0 }

  try {
    const res = await fetch(DHAN_LTP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access-token': token,
        'dhanClientId': clientId,
      },
      body: JSON.stringify({ NSE_EQ: [BAJFINANCE_ID, BAJAJFINSV_ID] }),
      cache: 'no-store',
    })

    if (!res.ok) {
      console.warn(`[dhan] HTTP ${res.status}: ${await res.text()}`)
      return { fin: 0, finsv: 0 }
    }

    const json = await res.json()
    const nse  = (json?.data?.NSE_EQ ?? {}) as Record<string, { last_price?: number }>
    const fin   = nse[String(BAJFINANCE_ID)]?.last_price  ?? 0
    const finsv = nse[String(BAJAJFINSV_ID)]?.last_price  ?? 0
    return { fin, finsv }
  } catch (err) {
    console.warn('[dhan] fetch error', err)
    return { fin: 0, finsv: 0 }
  }
}
