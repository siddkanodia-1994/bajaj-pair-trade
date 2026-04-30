import type { Signal, SignalType, TradingRules } from '@/types'
import { DEFAULT_RULES } from '@/types'

const SIGNALS: Record<SignalType, Omit<Signal, 'zscore'>> = {
  CAUTION_LONG: {
    type: 'CAUTION_LONG',
    label: 'CAUTION',
    description: 'Z-score beyond hard stop threshold — possible structural break',
    tailwindColor: 'text-amber-400',
    hexColor: '#fbbf24',
  },
  STRONG_LONG: {
    type: 'STRONG_LONG',
    label: 'STRONG LONG',
    description: 'Long Bajaj Finserv / Short Bajaj Finance',
    tailwindColor: 'text-green-400',
    hexColor: '#4ade80',
  },
  LONG: {
    type: 'LONG',
    label: 'LONG',
    description: 'Long Bajaj Finserv / Short Bajaj Finance',
    tailwindColor: 'text-green-300',
    hexColor: '#86efac',
  },
  HOLD: {
    type: 'HOLD',
    label: 'NO TRADE',
    description: 'Spread within historical norms — no edge',
    tailwindColor: 'text-slate-400',
    hexColor: '#94a3b8',
  },
  SHORT: {
    type: 'SHORT',
    label: 'SHORT',
    description: 'Short Bajaj Finserv / Long Bajaj Finance',
    tailwindColor: 'text-red-300',
    hexColor: '#fca5a5',
  },
  STRONG_SHORT: {
    type: 'STRONG_SHORT',
    label: 'STRONG SHORT',
    description: 'Short Bajaj Finserv / Long Bajaj Finance',
    tailwindColor: 'text-red-400',
    hexColor: '#f87171',
  },
  CAUTION_SHORT: {
    type: 'CAUTION_SHORT',
    label: 'CAUTION',
    description: 'Z-score beyond hard stop threshold — possible structural break',
    tailwindColor: 'text-amber-400',
    hexColor: '#fbbf24',
  },
}

export function generateSignal(zscore: number | null, rules: TradingRules = DEFAULT_RULES): Signal {
  let type: SignalType
  if (zscore === null) {
    type = 'HOLD'
  } else if (zscore <= -rules.hard_stop_z) {
    type = 'CAUTION_LONG'
  } else if (zscore >= rules.hard_stop_z) {
    type = 'CAUTION_SHORT'
  } else if (zscore <= rules.strong_long_threshold) {
    type = 'STRONG_LONG'
  } else if (zscore <= rules.long_threshold) {
    type = 'LONG'
  } else if (zscore >= rules.strong_short_threshold) {
    type = 'STRONG_SHORT'
  } else if (zscore >= rules.short_threshold) {
    type = 'SHORT'
  } else {
    type = 'HOLD'
  }
  return { ...SIGNALS[type], zscore: zscore ?? 0 }
}

/** Signal border color for cards */
export function signalBorderColor(type: SignalType): string {
  const map: Record<SignalType, string> = {
    CAUTION_LONG:  'border-amber-500',
    STRONG_LONG:   'border-green-500',
    LONG:          'border-green-400/60',
    HOLD:          'border-slate-600',
    SHORT:         'border-red-400/60',
    STRONG_SHORT:  'border-red-500',
    CAUTION_SHORT: 'border-amber-500',
  }
  return map[type]
}

/** Signal background glow for cards */
export function signalBgColor(type: SignalType): string {
  const map: Record<SignalType, string> = {
    CAUTION_LONG:  'bg-amber-950/30',
    STRONG_LONG:   'bg-green-950/40',
    LONG:          'bg-green-950/20',
    HOLD:          'bg-slate-800/40',
    SHORT:         'bg-red-950/20',
    STRONG_SHORT:  'bg-red-950/40',
    CAUTION_SHORT: 'bg-amber-950/30',
  }
  return map[type]
}
