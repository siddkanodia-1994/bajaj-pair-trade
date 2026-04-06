'use client'

import { useState, useRef, useEffect } from 'react'
import type { GrasimSubsidiary, GrasimStakeRow } from '@/types/grasim'
import { GRASIM_SUBSIDIARIES, GRASIM_SUBSIDIARY_LABELS } from '@/types/grasim'

interface Props {
  selected: GrasimSubsidiary[]
  onChange: (companies: GrasimSubsidiary[]) => void
  stakes: GrasimStakeRow[]
}

/** Latest stake % for a company from the provided stake rows. */
function latestStake(company: GrasimSubsidiary, stakes: GrasimStakeRow[]): number | null {
  const rows = stakes.filter((s) => s.company === company)
  if (rows.length === 0) return null
  const sorted = [...rows].sort((a, b) => b.quarter_end_date.localeCompare(a.quarter_end_date))
  return sorted[0].stake_pct
}

export default function SubsidiarySelector({ selected, onChange, stakes }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function toggle(company: GrasimSubsidiary) {
    if (selected.includes(company)) {
      if (selected.length === 1) return // keep at least one
      onChange(selected.filter((c) => c !== company))
    } else {
      onChange([...selected, company])
    }
  }

  const allSelected = selected.length === GRASIM_SUBSIDIARIES.length

  function toggleAll() {
    if (allSelected) {
      onChange([GRASIM_SUBSIDIARIES[0]])
    } else {
      onChange([...GRASIM_SUBSIDIARIES])
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-600 bg-slate-800 text-sm text-slate-300 hover:border-slate-400 transition-colors"
      >
        <span className="text-slate-500 text-xs">Basket</span>
        <span className="font-medium">{selected.length} of {GRASIM_SUBSIDIARIES.length}</span>
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1 right-0 z-50 w-72 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
          <div className="px-4 py-3 border-b border-slate-700">
            <div className="text-xs text-slate-400 uppercase tracking-wider">Subsidiaries in spread basket</div>
          </div>

          <div className="py-1">
            {GRASIM_SUBSIDIARIES.map((company) => {
              const checked  = selected.includes(company)
              const stakePct = latestStake(company, stakes)
              return (
                <button
                  key={company}
                  onClick={() => toggle(company)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800 transition-colors text-left"
                >
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    checked ? 'bg-blue-500 border-blue-500' : 'border-slate-600'
                  }`}>
                    {checked && (
                      <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-200">{GRASIM_SUBSIDIARY_LABELS[company]}</div>
                    <div className="text-xs text-slate-500">{company}</div>
                  </div>
                  {stakePct != null && (
                    <div className="text-xs text-slate-400 font-mono">{stakePct.toFixed(1)}%</div>
                  )}
                </button>
              )
            })}
          </div>

          <div className="px-4 py-2 border-t border-slate-700">
            <button
              onClick={toggleAll}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              {allSelected ? 'Clear all' : 'Select all'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
