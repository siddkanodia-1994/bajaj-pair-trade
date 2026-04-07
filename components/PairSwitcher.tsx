'use client'

import { useState } from 'react'
import Link from 'next/link'

interface Props {
  currentPair: 'bajaj' | 'grasim'
}

const PAIRS = [
  { id: 'bajaj',  label: 'Bajaj Finance / Finserv', href: '/' },
  { id: 'grasim', label: 'Grasim Industries',        href: '/grasim' },
] as const

export default function PairSwitcher({ currentPair }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {/* Trigger pill — inline styles bypass light-mode CSS variable remapping */}
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer select-none"
        style={{ backgroundColor: '#1e293b', border: '1px solid #475569', color: '#94a3b8' }}
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
        <span>Switch Pair</span>
        <svg
          className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {open && (
        <div className="absolute top-full right-0 mt-1">
          <div
            className="w-52 rounded-xl shadow-2xl overflow-hidden"
            style={{ backgroundColor: '#0f172a', border: '1px solid #334155' }}
          >
            {PAIRS.map((pair) => {
              const active = pair.id === currentPair
              return active ? (
                <div
                  key={pair.id}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm"
                  style={{ backgroundColor: '#1e293b', color: '#f1f5f9' }}
                >
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#60a5fa' }} />
                  {pair.label}
                </div>
              ) : (
                <Link
                  key={pair.id}
                  href={pair.href}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors"
                  style={{ color: '#94a3b8' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1e293b')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '')}
                >
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#475569' }} />
                  {pair.label}
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
