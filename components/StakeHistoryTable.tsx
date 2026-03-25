'use client'

import type { StakeHistoryRow } from '@/types'

interface Props {
  stakes: StakeHistoryRow[]
}

function fmtQuarter(dateStr: string) {
  const d = new Date(dateStr)
  const month = d.getMonth() // 0-indexed
  const year = d.getFullYear()
  // Indian FY: Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar
  let q: string
  let fy: string
  if (month >= 3 && month <= 5) {
    q = 'Q1'
    fy = `FY${String(year + 1).slice(2)}`
  } else if (month >= 6 && month <= 8) {
    q = 'Q2'
    fy = `FY${String(year + 1).slice(2)}`
  } else if (month >= 9 && month <= 11) {
    q = 'Q3'
    fy = `FY${String(year + 1).slice(2)}`
  } else {
    q = 'Q4'
    fy = `FY${String(year).slice(2)}`
  }
  return `${q} ${fy}`
}

export default function StakeHistoryTable({ stakes }: Props) {
  const sorted = [...stakes].sort(
    (a, b) => new Date(b.quarter_end_date).getTime() - new Date(a.quarter_end_date).getTime()
  )

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
      <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
        Bajaj Finserv Stake in Bajaj Finance (Quarterly)
      </h2>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 uppercase border-b border-slate-700">
              <th className="text-left pb-2">Quarter</th>
              <th className="text-left pb-2">Period End</th>
              <th className="text-right pb-2">Stake %</th>
              <th className="text-left pb-2 pl-4">Source</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const prev = sorted[i + 1]
              const change = prev ? row.stake_pct - prev.stake_pct : null
              return (
                <tr key={row.id} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                  <td className="py-2 text-slate-300">{fmtQuarter(row.quarter_end_date)}</td>
                  <td className="py-2 text-slate-400">
                    {new Date(row.quarter_end_date).toLocaleDateString('en-IN', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </td>
                  <td className="py-2 text-right font-medium text-white">
                    {row.stake_pct.toFixed(2)}%
                    {change != null && Math.abs(change) > 0.01 && (
                      <span className={`ml-2 text-xs ${change > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {change > 0 ? '+' : ''}{change.toFixed(2)}pp
                      </span>
                    )}
                  </td>
                  <td className="py-2 pl-4 text-slate-500 text-xs">
                    {row.source?.replace(' est', '') ?? '—'}
                    {row.source?.includes('est') && (
                      <span className="ml-1 text-slate-600 italic">est.</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-slate-600">
        Rows marked "est." are interpolated estimates. Confirmed values sourced from BSE shareholding pattern filings.
      </p>
    </div>
  )
}
