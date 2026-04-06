import type { TradingRules } from '@/types'

const DEFAULT_KEY = 'bajaj_rule_overrides'

export function getLocalRuleOverrides(key = DEFAULT_KEY): Partial<TradingRules> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Partial<TradingRules>) : {}
  } catch {
    return {}
  }
}

export function setLocalRuleOverride(ruleKey: keyof TradingRules, value: number, key = DEFAULT_KEY): void {
  if (typeof window === 'undefined') return
  const overrides = getLocalRuleOverrides(key)
  ;(overrides as Record<string, number>)[ruleKey as string] = value
  localStorage.setItem(key, JSON.stringify(overrides))
}

export function clearLocalRuleOverrides(key = DEFAULT_KEY): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(key)
}

export function hasLocalOverrides(key = DEFAULT_KEY): boolean {
  if (typeof window === 'undefined') return false
  return Object.keys(getLocalRuleOverrides(key)).length > 0
}
