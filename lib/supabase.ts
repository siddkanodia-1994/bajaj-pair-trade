import { createClient } from '@supabase/supabase-js'
import type { EodPriceRow } from '@/types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Browser / server-component read client (anon key, RLS disabled on these tables)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Server-side write client — only use inside API route handlers
export function createServerClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Paginated fetch — bypasses PostgREST's default 1000-row cap
export async function fetchAllEodPrices(): Promise<EodPriceRow[]> {
  const PAGE = 1000
  const all: EodPriceRow[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('eod_prices')
      .select('*')
      .order('date', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break // last page
    from += PAGE
  }
  return all
}
