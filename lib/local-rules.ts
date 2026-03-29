import type { TradingRules } from '@/types'

const KEY = 'bajaj_rule_overrides'

export function getLocalRuleOverrides(): Partial<TradingRules> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Partial<TradingRules>) : {}
  } catch {
    return {}
  }
}

export function setLocalRuleOverride(key: keyof TradingRules, value: number): void {
  if (typeof window === 'undefined') return
  const overrides = getLocalRuleOverrides()
  ;(overrides as Record<string, number>)[key as string] = value
  localStorage.setItem(KEY, JSON.stringify(overrides))
}

export function clearLocalRuleOverrides(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(KEY)
}

export function hasLocalOverrides(): boolean {
  if (typeof window === 'undefined') return false
  return Object.keys(getLocalRuleOverrides()).length > 0
}
