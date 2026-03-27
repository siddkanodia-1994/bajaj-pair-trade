import { supabase, fetchAllEodPrices } from '@/lib/supabase'
import { computeSpreadSeries } from '@/lib/spread-calculator'
import SpreadDashboard from '@/components/SpreadDashboard'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const [prices, { data: stakes }] = await Promise.all([
    fetchAllEodPrices(),
    supabase.from('stake_history').select('*').order('quarter_end_date', { ascending: true }),
  ])

  const spreadSeries = computeSpreadSeries(prices, stakes ?? [])

  return (
    <SpreadDashboard
      spreadSeries={spreadSeries}
      stakes={stakes ?? []}
      initialLiveData={null}
    />
  )
}
