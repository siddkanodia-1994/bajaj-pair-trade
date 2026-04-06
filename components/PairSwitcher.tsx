'use client'

import Link from 'next/link'

interface Props {
  currentPair: 'bajaj' | 'grasim'
}

const PAIRS = [
  { id: 'bajaj',  label: 'Bajaj Finance / Finserv', href: '/' },
  { id: 'grasim', label: 'Grasim Industries',        href: '/grasim' },
] as const

export default function PairSwitcher({ currentPair }: Props) {
  return (
    <div className="fixed top-4 right-4 z-50 group">
      {/* Trigger button */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-600 bg-slate-900/90 backdrop-blur text-xs text-slate-400 cursor-pointer hover:border-slate-400 hover:text-slate-200 transition-colors select-none">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
        <span>Switch Pair</span>
        <svg className="w-3 h-3 transition-transform group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Dropdown — visible on hover */}
      <div className="absolute top-full right-0 mt-1 hidden group-hover:block">
        <div className="w-52 rounded-xl border border-slate-700 bg-slate-900/95 backdrop-blur shadow-2xl overflow-hidden">
          {PAIRS.map((pair) => {
            const active = pair.id === currentPair
            return active ? (
              <div
                key={pair.id}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-white bg-slate-700/50"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                {pair.label}
              </div>
            ) : (
              <Link
                key={pair.id}
                href={pair.href}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                {pair.label}
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
