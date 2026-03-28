import type { TradeTranche, TradeSignal, TradeSignalAction, TradingRules } from '@/types'

const HARD_STOP_Z = -2.8
const TIME_STOP_DAYS = 60
const TRANCHE_SIZES = ['50%', '30%', '20%']

function calDaysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

export function getDaysHeld(oldestEntryDate: string): number {
  return calDaysBetween(oldestEntryDate, todayISO())
}

/** Weighted average entry spread and Z across open tranches (weights: 50/30/20). */
export function getBlendedEntry(tranches: TradeTranche[]): {
  blendedSpread: number
  blendedZ: number | null
  totalWeight: number
} {
  if (tranches.length === 0) return { blendedSpread: 0, blendedZ: null, totalWeight: 0 }

  const weightOf = (t: TradeTranche) => {
    const pct = parseInt(t.size_label.replace('%', ''), 10)
    return isNaN(pct) ? 50 : pct
  }

  const totalWeight = tranches.reduce((s, t) => s + weightOf(t), 0)
  const blendedSpread = tranches.reduce((s, t) => s + t.entry_spread * weightOf(t), 0) / totalWeight

  const zTranches = tranches.filter((t) => t.entry_z != null)
  const blendedZ =
    zTranches.length === 0
      ? null
      : zTranches.reduce((s, t) => s + t.entry_z! * weightOf(t), 0) /
        zTranches.reduce((s, t) => s + weightOf(t), 0)

  return { blendedSpread, blendedZ, totalWeight }
}

function makeSignal(
  action: TradeSignalAction,
  urgency: TradeSignal['urgency'],
  label: string,
  description: string
): TradeSignal {
  const colorMap: Record<TradeSignalAction, string> = {
    ENTER:          'text-green-400',
    ADD:            'text-green-300',
    HOLD:           'text-blue-400',
    WATCH:          'text-amber-400',
    EXIT_TARGET:    'text-green-400',
    EXIT_TIME:      'text-amber-400',
    EXIT_HARD_STOP: 'text-red-400',
    NEUTRAL:        'text-slate-400',
  }
  const bgMap: Record<TradeSignalAction, string> = {
    ENTER:          'bg-green-500/10',
    ADD:            'bg-green-500/5',
    HOLD:           'bg-blue-500/5',
    WATCH:          'bg-amber-500/5',
    EXIT_TARGET:    'bg-green-500/10',
    EXIT_TIME:      'bg-amber-500/10',
    EXIT_HARD_STOP: 'bg-red-500/10',
    NEUTRAL:        'bg-slate-800/50',
  }
  const borderMap: Record<TradeSignalAction, string> = {
    ENTER:          'border-green-500',
    ADD:            'border-green-400/50',
    HOLD:           'border-blue-500/50',
    WATCH:          'border-amber-500/50',
    EXIT_TARGET:    'border-green-500',
    EXIT_TIME:      'border-amber-500',
    EXIT_HARD_STOP: 'border-red-500',
    NEUTRAL:        'border-slate-700',
  }
  return {
    action, urgency, label, description,
    tailwindColor: colorMap[action],
    bgClass:       bgMap[action],
    borderClass:   borderMap[action],
  }
}

/**
 * Derives the current trade signal from live Z-score + open tranche state.
 * Pure function — no side effects.
 */
export function evaluateTradeSignal(
  currentZ: number | null,
  openTranches: TradeTranche[],
  rules: TradingRules
): TradeSignal {
  if (openTranches.length > 0) {
    // ── Exit checks (priority order) ─────────────────────────────────────────
    if (currentZ != null) {
      if (currentZ >= rules.exit_zone_lo && currentZ <= rules.exit_zone_hi) {
        return makeSignal(
          'EXIT_TARGET', 'high',
          'EXIT — Target Hit',
          `Z-score (${currentZ.toFixed(2)}) has entered the exit zone [${rules.exit_zone_lo}, ${rules.exit_zone_hi}]. Close position.`
        )
      }
      if (currentZ <= HARD_STOP_Z) {
        return makeSignal(
          'EXIT_HARD_STOP', 'critical',
          'EXIT — Hard Stop',
          `Z-score (${currentZ.toFixed(2)}) hit the hard stop at ${HARD_STOP_Z}. Possible structural break — exit immediately.`
        )
      }
    }

    const oldestEntry = [...openTranches].sort((a, b) => a.entry_date.localeCompare(b.entry_date))[0]
    const daysHeld = getDaysHeld(oldestEntry.entry_date)
    if (daysHeld >= TIME_STOP_DAYS) {
      return makeSignal(
        'EXIT_TIME', 'high',
        'EXIT — Time Stop',
        `${daysHeld} days held — 60-day time stop reached. Close position regardless of Z-score.`
      )
    }

    // ── Add-to-trade check ────────────────────────────────────────────────────
    const nextTranche = openTranches.length + 1
    if (nextTranche <= 3 && currentZ != null) {
      const latestEntry = [...openTranches].sort((a, b) => b.entry_date.localeCompare(a.entry_date))[0]
      const lastZ = latestEntry.entry_z
      const direction = latestEntry.direction
      const movedFurther = direction === 'long'
        ? lastZ != null && currentZ <= lastZ - rules.add_to_trade_gap
        : lastZ != null && currentZ >= lastZ + rules.add_to_trade_gap

      if (movedFurther) {
        const sizeLabel = TRANCHE_SIZES[nextTranche - 1] ?? '20%'
        return makeSignal(
          'ADD', 'medium',
          `ADD — Tranche ${nextTranche} (${sizeLabel})`,
          `Z has moved ${rules.add_to_trade_gap} SD further. Add ${sizeLabel} position at current level.`
        )
      }
    }

    // ── Hold ─────────────────────────────────────────────────────────────────
    const daysLeft = TIME_STOP_DAYS - daysHeld
    return makeSignal(
      'HOLD', 'low',
      'HOLD',
      `Trade within parameters. ${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining before time stop.`
    )
  }

  // ── No open trades ────────────────────────────────────────────────────────
  if (currentZ == null) {
    return makeSignal('NEUTRAL', 'none', 'NEUTRAL', 'Insufficient data to compute Z-score.')
  }

  if (currentZ <= rules.strong_long_threshold) {
    return makeSignal(
      'ENTER', 'high',
      'ENTER — Strong Long',
      `Z (${currentZ.toFixed(2)}) ≤ ${rules.strong_long_threshold}. True dislocation (~6th pctile). Initiate Tranche 1 (50%).`
    )
  }
  if (currentZ <= rules.long_threshold) {
    return makeSignal(
      'WATCH', 'low',
      'WATCH — Approaching',
      `Z (${currentZ.toFixed(2)}) approaching entry. Wait for Z ≤ ${rules.strong_long_threshold} to enter.`
    )
  }
  if (currentZ >= rules.strong_short_threshold) {
    return makeSignal(
      'ENTER', 'high',
      'ENTER — Strong Short',
      `Z (${currentZ.toFixed(2)}) ≥ ${rules.strong_short_threshold}. Initiate Tranche 1 (50%) short.`
    )
  }
  if (currentZ >= rules.short_threshold) {
    return makeSignal(
      'WATCH', 'low',
      'WATCH — Approaching Short',
      `Z (${currentZ.toFixed(2)}) approaching short entry. Wait for Z ≥ ${rules.strong_short_threshold}.`
    )
  }

  return makeSignal('NEUTRAL', 'none', 'NEUTRAL', 'Spread within normal range. No trade signal.')
}
