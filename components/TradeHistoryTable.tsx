'use client'

import type { TradeTranche } from '@/types'

interface Props {
  closedTranches: TradeTranche[]
}

function fmt(n: number, d = 2) {
  return `${n > 0 ? '+' : ''}${n.toFixed(d)}`
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function calDays(a: string, b: string | null) {
  if (!b) return null
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}

export default function TradeHistoryTable({ closedTranches }: Props) {
  const sorted = [...closedTranches].sort((a, b) =>
    (b.exit_date ?? b.created_at).localeCompare(a.exit_date ?? a.created_at)
  )

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
      <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
        Trade History
      </h2>

      {sorted.length === 0 ? (
        <div className="text-sm text-slate-500 py-6 text-center">
          No closed trades yet. History will appear here after you exit positions.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 uppercase border-b border-slate-700">
              <th className="text-left pb-2">Opened</th>
              <th className="text-right pb-2">T#</th>
              <th className="text-right pb-2">Size</th>
              <th className="text-right pb-2">Entry Spread</th>
              <th className="text-right pb-2">Entry Z</th>
              <th className="text-left pb-2 pl-4">Closed</th>
              <th className="text-right pb-2">Exit Spread</th>
              <th className="text-right pb-2">Exit Z</th>
              <th className="text-right pb-2">Return</th>
              <th className="text-right pb-2">Days</th>
              <th className="text-right pb-2">Reason</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => {
              const returnPp = t.exit_spread != null ? t.exit_spread - t.entry_spread : null
              const days = calDays(t.entry_date, t.exit_date)
              const isWin = returnPp != null && (t.direction === 'long' ? returnPp > 0 : returnPp < 0)

              return (
                <tr key={t.id} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                  <td className="py-2 text-slate-300">{fmtDate(t.entry_date)}</td>
                  <td className="py-2 text-right text-slate-400">{t.tranche_num}</td>
                  <td className="py-2 text-right text-blue-300 font-medium">{t.size_label}</td>
                  <td className="py-2 text-right text-slate-300">{t.entry_spread.toFixed(2)}%</td>
                  <td className="py-2 text-right text-slate-400">
                    {t.entry_z != null ? fmt(t.entry_z) : '—'}
                  </td>
                  <td className="py-2 pl-4 text-slate-300">{fmtDate(t.exit_date)}</td>
                  <td className="py-2 text-right text-slate-300">
                    {t.exit_spread != null ? `${t.exit_spread.toFixed(2)}%` : '—'}
                  </td>
                  <td className="py-2 text-right text-slate-400">
                    {t.exit_z != null ? fmt(t.exit_z) : '—'}
                  </td>
                  <td className={`py-2 text-right font-medium ${returnPp == null ? 'text-slate-400' : isWin ? 'text-green-400' : 'text-red-400'}`}>
                    {returnPp != null ? `${fmt(returnPp)}pp` : '—'}
                  </td>
                  <td className="py-2 text-right text-slate-400">{days ?? '—'}</td>
                  <td className="py-2 text-right">
                    {t.exit_reason ? (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        t.exit_reason === 'target'    ? 'bg-green-900/40 text-green-400' :
                        t.exit_reason === 'hard_stop' ? 'bg-red-900/40 text-red-400' :
                        t.exit_reason === 'time_stop' ? 'bg-amber-900/40 text-amber-400' :
                        'bg-slate-700 text-slate-400'
                      }`}>
                        {t.exit_reason === 'target'    ? 'Target'    :
                         t.exit_reason === 'hard_stop' ? 'Hard Stop' :
                         t.exit_reason === 'time_stop' ? 'Time Stop' : 'Manual'}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <div className="mt-3 text-xs text-slate-600">
        {sorted.length} closed tranche{sorted.length !== 1 ? 's' : ''} · Return = exit spread − entry spread (pp). Positive = spread widened.
      </div>
    </div>
  )
}
