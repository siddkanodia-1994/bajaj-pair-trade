export const GRASIM_SUBSIDIARIES = ['ULTRACEMCO', 'ABCAPITAL', 'IDEA', 'HINDALCO', 'ABFRL', 'ABLBL'] as const
export type GrasimSubsidiary = typeof GRASIM_SUBSIDIARIES[number]
export const GRASIM_DEFAULT_SELECTION: GrasimSubsidiary[] = ['ULTRACEMCO', 'ABCAPITAL']

export const GRASIM_SUBSIDIARY_LABELS: Record<GrasimSubsidiary, string> = {
  ULTRACEMCO: 'UltraTech Cement',
  ABCAPITAL:  'Aditya Birla Capital',
  IDEA:       'Vodafone Idea',
  HINDALCO:   'Hindalco Industries',
  ABFRL:      'AB Fashion & Retail',
  ABLBL:      'AB Lifestyle Brands',
}

export interface GrasimEodRow {
  date: string
  grasim_price: number
  grasim_mcap: number
  grasim_shares: number
  ultracemco_price: number
  ultracemco_mcap: number
  ultracemco_shares: number
  abcapital_price: number
  abcapital_mcap: number
  abcapital_shares: number
  idea_price: number
  idea_mcap: number
  idea_shares: number
  hindalco_price: number
  hindalco_mcap: number
  hindalco_shares: number
  abfrl_price: number
  abfrl_mcap: number
  abfrl_shares: number
  ablbl_price: number | null
  ablbl_mcap: number | null
  ablbl_shares: number | null
  source?: string
}

export interface GrasimStakeRow {
  quarter_end_date: string
  company: string   // GrasimSubsidiary value
  stake_pct: number
  source: string | null
}

export interface GrasimShareRow {
  effective_date: string
  company: string
  shares: number
  source: string | null
}

export interface GrasimLiveQuote {
  ticker: string
  price: number
  mcap: number        // ₹ crore
  change_pct: number
  last_updated: string
}

export interface GrasimLiveData {
  grasim: GrasimLiveQuote
  ultracemco: GrasimLiveQuote
  abcapital: GrasimLiveQuote
  idea: GrasimLiveQuote
  hindalco: GrasimLiveQuote
  abfrl: GrasimLiveQuote
  ablbl: GrasimLiveQuote
  selectedCompanies: GrasimSubsidiary[]
  basket_mcap: number
  residual_value: number
  spread_pct: number
  as_of: string
}

/**
 * Pre-computed raw point with all 7 MCap columns per date.
 * Passed as prop to GrasimDashboard so selection changes re-derive
 * spread_pct client-side without any network call.
 */
export interface GrasimRawPoint {
  date: string
  grasim_mcap: number
  grasim_price: number
  ultracemco_mcap: number
  abcapital_mcap: number
  idea_mcap: number
  hindalco_mcap: number
  abfrl_mcap: number
  ablbl_mcap: number  // 0 before ABLBL demerger (Jun 2025)
}
